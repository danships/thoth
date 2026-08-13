import { after } from 'next/server';
import {
  enqueueJob,
  JobClientError,
  type NotificationDispatchPayloadV1,
  type NotificationActor,
} from '@thoth/job-protocol';
import { getLogger } from '@/lib/logger';
import type { Container, WebhookDeliveryEvent } from '@thoth/database/types';

// This file only orchestrates page-change notifications by submitting a `notification.dispatch`
// job over the Unix-socket IPC (THOTH-066) — it never resolves recipients, rules, or membership,
// and never renders an inbox item itself; all of that happens inside `@thoth/jobs` (see
// `apps/jobs/src/handlers/notifications/dispatch.ts`), which reloads current page/rule/membership
// state at execution time rather than trusting anything this file sends. This module is a
// sibling of `apps/web/src/lib/webhooks/notify-service.ts` (THOTH-061) — same shape, same
// best-effort/never-throws contract, same bounded retry — kept as an independent producer/job
// type so THOTH-071 can extend the notification side without touching webhooks.

export type NotificationActorInput = NotificationActor;

const MAX_ENQUEUE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrator invoked (via `after()`, from the page-mutation routes) once a page change has
 * already been committed and the response is on its way. Submits a `notification.dispatch`
 * request carrying only ids/actor/event/changeCount/occurredAt — never sessions, grants, page
 * content, or rule/recipient data. Never throws: the mutation response has already been sent, so
 * a failure here is best-effort (bounded retry, then a correlated error log) rather than a
 * request-level error.
 */
export async function notifyNotificationPageChange(
  event: WebhookDeliveryEvent,
  container: Container,
  actor: NotificationActor,
  changeCount: number
): Promise<void> {
  if (container.type !== 'page') {
    return;
  }

  const socketPath = process.env['JOB_SOCKET_PATH'];
  if (!socketPath) {
    // No jobs process configured for this environment (e.g. a targeted `dev:web`-only run) —
    // nothing to notify, and not worth logging on every mutation.
    return;
  }

  const payload: NotificationDispatchPayloadV1 = {
    workspaceId: container.workspaceId,
    containerId: container.id,
    event,
    actor,
    changeCount: Math.max(0, Math.min(changeCount, 100_000)),
    occurredAt: new Date().toISOString(),
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ENQUEUE_ATTEMPTS; attempt += 1) {
    try {
      const response = await enqueueJob({ type: 'notification.dispatch', payloadVersion: 1, payload }, { socketPath });
      if (!response.ok) {
        throw new JobClientError('SERVER_ERROR', response.error.message, response.error.retryable);
      }
      return;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof JobClientError ? error.retryable : true;
      if (!retryable || attempt === MAX_ENQUEUE_ATTEMPTS) {
        break;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  const logger = await getLogger();
  logger.error('notifications.dispatch.enqueue-failed', {
    workspaceId: container.workspaceId,
    containerId: container.id,
    event,
    error: lastError,
  });
}

/** Schedules `notifyNotificationPageChange` to run after the response has been flushed via `next/server`'s `after()`. */
export function scheduleNotificationDispatch(
  event: WebhookDeliveryEvent,
  container: Container,
  actor: NotificationActor,
  changeCount = 1
): void {
  after(() => notifyNotificationPageChange(event, container, actor, changeCount));
}

export { type NotificationActor } from '@thoth/job-protocol';
