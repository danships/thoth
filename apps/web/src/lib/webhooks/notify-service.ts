import { after } from 'next/server';
import { enqueueJob, JobClientError, type WebhookActor, type WebhookDispatchPayloadV1 } from '@thoth/job-protocol';
import type { PageValue } from '@thoth/database';
import { getLogger } from '@/lib/logger';
import type { Container, WebhookDeliveryEvent } from '@thoth/database/types';

// This file only orchestrates page-change notifications by submitting a `webhook.dispatch` job
// over the Unix-socket IPC (THOTH-061) — it never resolves webhooks, builds a payload, or
// performs an outbound `fetch` itself; all of that now happens inside `@thoth/jobs` (see
// `apps/jobs/src/handlers/webhooks/*`), which reloads current page/data-source/webhook state at
// execution time rather than trusting anything this file sends.

export type ValueChangeInput = NonNullable<WebhookDispatchPayloadV1['valueChanges']>;

export type NotifyPageChangeOptions = {
  valueChanges?: Record<string, { previous: PageValue | null; new: PageValue | null }>;
};

const MAX_ENQUEUE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrator invoked (via `after()`, from the page-mutation routes) once a page change has
 * already been committed and the response is on its way. Submits a `webhook.dispatch` request
 * carrying only ids/actor/event/value-changes — never sessions, grants, page content, or
 * webhook ids/URLs/secrets. Never throws: the mutation response has already been sent, so a
 * failure here is best-effort (bounded retry, then a correlated error log) rather than a
 * request-level error.
 */
export async function notifyPageChange(
  event: WebhookDeliveryEvent,
  container: Container,
  actor: WebhookActor,
  options: NotifyPageChangeOptions = {}
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

  const payload: WebhookDispatchPayloadV1 = {
    workspaceId: container.workspaceId,
    containerId: container.id,
    event,
    actor,
    ...(options.valueChanges ? { valueChanges: options.valueChanges } : {}),
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ENQUEUE_ATTEMPTS; attempt += 1) {
    try {
      const response = await enqueueJob({ type: 'webhook.dispatch', payloadVersion: 1, payload }, { socketPath });
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
  logger.error('webhooks.dispatch.enqueue-failed', {
    workspaceId: container.workspaceId,
    containerId: container.id,
    event,
    error: lastError,
  });
}

/** Schedules `notifyPageChange` to run after the response has been flushed via `next/server`'s `after()`. */
export function scheduleNotifyPageChange(
  event: WebhookDeliveryEvent,
  container: Container,
  actor: WebhookActor,
  options?: NotifyPageChangeOptions
): void {
  after(() => notifyPageChange(event, container, actor, options));
}

export { type WebhookActor } from '@thoth/job-protocol';
