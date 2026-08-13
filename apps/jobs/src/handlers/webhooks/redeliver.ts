import { z } from 'zod';
import { getWebhookDeliveryRepository, getWebhookRepository, resetDeliveryForResend } from '@thoth/database';
import { webhookRedeliverPayloadV1Schema, type JobDefinition, type JobExecutionContext } from '@thoth/job-protocol';

const REDELIVER_MAX_ATTEMPTS = 1; // Orchestration only; the created `webhook.deliver` child owns its own retry policy.

export type WebhookRedeliverPayload = z.infer<typeof webhookRedeliverPayloadV1Schema>;

/**
 * `webhook.redeliver` — submitted by the manual-resend route (THOTH-061). The route has already
 * authorised the request (App/webhook/delivery ownership, enabled webhook) before enqueueing;
 * this handler idempotently resets the delivery row to `pending` (as part of "accepted setup",
 * per spec) and creates/reuses a `webhook.deliver` execution for it. A duplicate resend of an
 * already `pending`/`retrying` row is a safe no-op here — the route itself is expected to reject
 * that case with a 409 before ever enqueueing, but this handler defends against a race (two
 * concurrent resend requests) by treating `resetDeliveryForResend`'s `'already-active'` result
 * as a no-op rather than an error.
 */
export const webhookRedeliverJobDefinition: JobDefinition<WebhookRedeliverPayload> = {
  type: 'webhook.redeliver',
  payloadVersion: 1,
  payloadSchema: webhookRedeliverPayloadV1Schema,
  priority: 30,
  maxAttempts: REDELIVER_MAX_ATTEMPTS,
  handler: async (context: JobExecutionContext<WebhookRedeliverPayload>) => {
    const { deliveryId } = context.payload;

    const webhookDeliveryRepository = await getWebhookDeliveryRepository();
    const existing = await webhookDeliveryRepository.getOneByQuery(
      webhookDeliveryRepository.createQuery().eq('id', deliveryId)
    );
    if (!existing) {
      return { result: 'not-found' };
    }

    const webhookRepository = await getWebhookRepository();
    const webhook = await webhookRepository.getOneByQuery(
      webhookRepository.createQuery().eq('id', existing.webhookId)
    );
    if (!webhook || !webhook.enabled) {
      return { result: 'webhook-disabled-or-missing' };
    }

    const resetResult = await resetDeliveryForResend(deliveryId);
    if (resetResult === 'not-found') {
      return { result: 'not-found' };
    }
    if (resetResult === 'already-active') {
      return { result: 'already-active' };
    }

    await context.enqueueChild({
      type: 'webhook.deliver',
      payloadVersion: 1,
      payload: { deliveryId },
      dedupeKey: `delivery:${deliveryId}`,
    });

    return { result: 'accepted', deliveryId };
  },
};
