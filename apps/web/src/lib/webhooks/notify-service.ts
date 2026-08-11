import { after } from 'next/server';
import { getLogger } from '@/lib/logger';
import { buildPayload } from './build-payload';
import { deliverWebhook } from './deliver-webhook';
import { resolveDataSourceParent, resolveWebhooksToNotify } from './resolve-webhooks';
import type { WebhookActor } from './resolve-webhooks';
import type { ValueChangeInput } from './build-payload';
import type { Container, WebhookDeliveryEvent } from '@thoth/database/types';

// This file only orchestrates page-change notifications. The building blocks it composes live
// in sibling files: `resolve-webhooks.ts` (which webhooks/apps match a change), `build-payload.ts`
// (assembling the outbound JSON body), `deliver-webhook.ts` (signing + POSTing + recording a
// delivery) and `resend-delivery.ts` (re-POSTing a stored delivery).

export type NotifyPageChangeOptions = {
  valueChanges?: ValueChangeInput;
};

/**
 * Orchestrator invoked (via `after()`, from the page-mutation routes) once a page change has
 * already been committed and the response is on its way. Resolves the container's data-source
 * parent (if any) and the webhooks to notify, builds the payload once, then delivers to each
 * matched webhook concurrently. Never throws — every failure is self-contained inside
 * `deliverWebhook`, and resolver failures are only logged.
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

  try {
    const dataSource = await resolveDataSourceParent(container);
    const webhooks = await resolveWebhooksToNotify(container, container.workspaceId, actor, dataSource);

    if (webhooks.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const payload = await buildPayload(
          event,
          crypto.randomUUID(),
          container.workspaceId,
          webhook.appId,
          container,
          dataSource,
          options.valueChanges
        );
        await deliverWebhook(webhook, payload);
      })
    );

    const logger = await getLogger();
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Webhook delivery failed unexpectedly', { error: result.reason });
      }
    }
  } catch (error) {
    const logger = await getLogger();
    logger.error('Failed to resolve/deliver webhooks for page change', { error });
  }
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
