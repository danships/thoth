import { z } from 'zod';
import {
  completeDelivery,
  getWebhookDeliveryRepository,
  getWebhookRepository,
  scheduleDeliveryRetry,
  signPayload,
  type WebhookDelivery,
} from '@thoth/database';
import { RetryableJobError, type JobDefinition, type JobExecutionContext } from '@thoth/job-protocol';
import { assertPublicHttpsUrl } from './ssrf';
import { parseRetryAfterMs } from './backoff';
import { computeBackoffMs } from '../../runner/backoff';
import { getEnvironment } from '../../environment';

const MAX_STORED_ERROR_LENGTH = 500;
const MAX_DELIVERY_ATTEMPTS = 5;

export const webhookDeliverPayloadSchema = z.object({ deliveryId: z.string().min(1) }).strict();
export type WebhookDeliverPayload = z.infer<typeof webhookDeliverPayloadSchema>;

export function truncateError(message: string): string {
  return message.length > MAX_STORED_ERROR_LENGTH ? `${message.slice(0, MAX_STORED_ERROR_LENGTH)}…` : message;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429]);

function isRetryableStatus(status: number): boolean {
  return status >= 500 || RETRYABLE_STATUSES.has(status);
}

/**
 * `webhook.deliver` — the internal child job created per-destination by `webhook.dispatch`
 * (THOTH-061). Reloads the delivery row (immutable payload) and the *current* webhook state on
 * every attempt (URL/secret/enabled can change between retries), re-runs the SSRF guard
 * immediately before every `fetch`, signs the stored payload verbatim, and classifies the
 * outcome: any 2xx is success; network/DNS/timeout errors, `408`/`425`/`429`/`5xx` are
 * retryable; anything else (other 4xx, SSRF rejection) is a terminal failure. A `Retry-After`
 * response header is honoured (bounded by the queue's cap) via `RetryableJobError.retryAfterMs`.
 */
export const webhookDeliverJobDefinition: JobDefinition<WebhookDeliverPayload> = {
  type: 'webhook.deliver',
  payloadVersion: 1,
  payloadSchema: webhookDeliverPayloadSchema,
  priority: 10,
  maxAttempts: MAX_DELIVERY_ATTEMPTS,
  handler: async (context: JobExecutionContext<WebhookDeliverPayload>) => {
    const webhookDeliveryRepository = await getWebhookDeliveryRepository();
    const delivery = await webhookDeliveryRepository.getOneByQuery(
      webhookDeliveryRepository.createQuery().eq('id', context.payload.deliveryId)
    );

    if (!delivery) {
      // The delivery row is gone (e.g. the webhook/App was deleted concurrently) — nothing left
      // to do; complete normally rather than retrying forever.
      return { skipped: 'delivery-not-found' };
    }

    if (delivery.status === 'success' || delivery.status === 'failed' || delivery.status === 'cancelled') {
      // Already terminal (e.g. a duplicate/replayed child enqueue after a crash) — never send twice.
      return { skipped: 'already-terminal', status: delivery.status };
    }

    const webhookRepository = await getWebhookRepository();
    const webhook = await webhookRepository.getOneByQuery(
      webhookRepository.createQuery().eq('id', delivery.webhookId)
    );

    if (!webhook || !webhook.enabled) {
      await completeDelivery(delivery.id, { status: 'cancelled' });
      return { cancelled: true };
    }

    return deliverOnce(delivery, webhook.url, webhook.secret, context);
  },
};

async function deliverOnce(
  delivery: WebhookDelivery,
  url: string,
  secret: string,
  context: JobExecutionContext<WebhookDeliverPayload>
): Promise<unknown> {
  const rawBody = JSON.stringify(delivery.payload);

  try {
    await assertPublicHttpsUrl(url);

    const signature = signPayload(secret, rawBody);
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Thoth-Signature': signature,
        'X-Thoth-Event': delivery.payload.event,
      },
      body: rawBody,
      signal: AbortSignal.timeout(getEnvironment().WEBHOOK_DELIVERY_TIMEOUT_MS),
    });

    if (response.ok) {
      await completeDelivery(delivery.id, { status: 'success', httpStatus: response.status });
      return { status: 'success', httpStatus: response.status };
    }

    if (isRetryableStatus(response.status)) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), context.now);
      return retryOrFail(delivery, context, {
        httpStatus: response.status,
        error: truncateError((await response.text().catch(() => '')) || `Non-2xx response: ${response.status}`),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }

    const bodySnippet = await response.text().catch(() => '');
    await completeDelivery(delivery.id, {
      status: 'failed',
      httpStatus: response.status,
      error: truncateError(bodySnippet || `Non-2xx response: ${response.status}`),
    });
    return { status: 'failed', httpStatus: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown delivery error';
    return retryOrFail(delivery, context, { httpStatus: null, error: truncateError(message) });
  }
}

async function retryOrFail(
  delivery: WebhookDelivery,
  context: JobExecutionContext<WebhookDeliverPayload>,
  outcome: { httpStatus: number | null; error: string; retryAfterMs?: number }
): Promise<unknown> {
  const exhausted = context.attempt >= context.maxAttempts;

  if (exhausted) {
    await completeDelivery(delivery.id, { status: 'failed', httpStatus: outcome.httpStatus, error: outcome.error });
    return { status: 'failed', httpStatus: outcome.httpStatus, exhausted: true };
  }

  const delayMs = outcome.retryAfterMs ?? computeBackoffMs(context.attempt, { baseMs: getEnvironment().WEBHOOK_DELIVERY_BACKOFF_BASE_MS });
  const nextAttemptAt = new Date(context.now().getTime() + delayMs).toISOString();
  await scheduleDeliveryRetry(delivery.id, { httpStatus: outcome.httpStatus, error: outcome.error, nextAttemptAt });

  throw new RetryableJobError(outcome.error, { retryAfterMs: delayMs });
}
