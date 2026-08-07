import { getWebhookDeliveryRepository, getWebhookRepository } from '@/lib/database';
import { signPayload } from '@/lib/database/webhook-service';
import { assertPublicHttpsUrl } from './ssrf';
import { FETCH_TIMEOUT_MS, truncateError } from './deliver-webhook';
import type { WebhookDelivery } from '@/types/database';

export type ResendResult = { delivery: WebhookDelivery; webhookDisabled: boolean };

/**
 * Re-POSTs a stored delivery's `payload` verbatim to its webhook's *current* `url` (re-running
 * the SSRF check at execution time), updating the same `webhook-delivery` row in place
 * (`status`, `httpStatus`, `error`, `attempts++`, `lastAttemptAt`) rather than creating a new
 * history row. Returns `webhookDisabled: true` (without attempting delivery) if the webhook is
 * currently disabled — the route layer maps this to a 409.
 */
export async function resendDelivery(
  appId: string,
  webhookId: string,
  deliveryId: string
): Promise<ResendResult | undefined> {
  const webhookRepository = await getWebhookRepository();
  const webhook = await webhookRepository.getOneByQuery(
    webhookRepository.createQuery().eq('id', webhookId).eq('appId', appId)
  );
  if (!webhook) {
    return undefined;
  }

  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const delivery = await webhookDeliveryRepository.getOneByQuery(
    webhookDeliveryRepository.createQuery().eq('id', deliveryId).eq('webhookId', webhookId).eq('appId', appId)
  );
  if (!delivery) {
    return undefined;
  }

  if (!webhook.enabled) {
    return { delivery, webhookDisabled: true };
  }

  const rawBody = JSON.stringify(delivery.payload);
  const now = new Date().toISOString();

  let status: 'success' | 'failed';
  let httpStatus: number | null;
  let error: string | null;

  try {
    await assertPublicHttpsUrl(webhook.url);

    const signature = signPayload(webhook.secret, rawBody);
    const response = await fetch(webhook.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Thoth-Signature': signature,
        'X-Thoth-Event': delivery.event,
      },
      body: rawBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      status = 'success';
      httpStatus = response.status;
      error = null;
    } else {
      status = 'failed';
      httpStatus = response.status;
      const bodySnippet = await response.text().catch(() => '');
      error = truncateError(bodySnippet || `Non-2xx response: ${response.status}`);
    }
  } catch (caughtError) {
    status = 'failed';
    httpStatus = null;
    error = truncateError(caughtError instanceof Error ? caughtError.message : 'Unknown delivery error');
  }

  const updated = await webhookDeliveryRepository.update({
    ...delivery,
    status,
    httpStatus,
    error,
    attempts: delivery.attempts + 1,
    lastAttemptAt: now,
  });

  return { delivery: updated, webhookDisabled: false };
}
