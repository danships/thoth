import { recordAndPrune, signPayload } from '@/lib/database/webhook-service';
import { assertPublicHttpsUrl } from './ssrf';
import type { Webhook, WebhookPayload } from '@/types/database';

const FETCH_TIMEOUT_MS = 5000;
const MAX_STORED_ERROR_LENGTH = 500;

export function truncateError(message: string): string {
  return message.length > MAX_STORED_ERROR_LENGTH ? `${message.slice(0, MAX_STORED_ERROR_LENGTH)}…` : message;
}

/**
 * Delivers `payload` to `webhook.url`. Re-runs the SSRF check immediately before every `fetch`
 * (execution-time, not just config-time — defends against DNS rebinding), signs the raw JSON
 * body with the webhook's secret, and always records the outcome as a `webhook-delivery` row —
 * a thrown fetch/timeout/SSRF-rejection becomes a `failed` row, never a thrown error.
 */
export async function deliverWebhook(webhook: Webhook, payload: WebhookPayload): Promise<void> {
  const rawBody = JSON.stringify(payload);

  try {
    await assertPublicHttpsUrl(webhook.url);

    const signature = signPayload(webhook.secret, rawBody);

    const response = await fetch(webhook.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Thoth-Signature': signature,
        'X-Thoth-Event': payload.event,
      },
      body: rawBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      await recordAndPrune({
        webhookId: webhook.id,
        appId: webhook.appId,
        event: payload.event,
        containerId: payload.page.id,
        payload,
        status: 'success',
        httpStatus: response.status,
        error: null,
      });
      return;
    }

    const bodySnippet = await response.text().catch(() => '');
    await recordAndPrune({
      webhookId: webhook.id,
      appId: webhook.appId,
      event: payload.event,
      containerId: payload.page.id,
      payload,
      status: 'failed',
      httpStatus: response.status,
      error: truncateError(bodySnippet || `Non-2xx response: ${response.status}`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown delivery error';
    await recordAndPrune({
      webhookId: webhook.id,
      appId: webhook.appId,
      event: payload.event,
      containerId: payload.page.id,
      payload,
      status: 'failed',
      httpStatus: null,
      error: truncateError(message),
    });
  }
}

export { FETCH_TIMEOUT_MS };
