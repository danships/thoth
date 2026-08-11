import crypto from 'node:crypto';
import { getWebhookDeliveryRepository, getWebhookRepository } from './repositories';
import type { Webhook, WebhookDelivery, WebhookDeliveryStatus, WebhookPayload } from './types';

// Cap on how many `webhook-delivery` rows are retained per webhook — see `recordAndPrune`. Also
// reused as the `.limit()` on the deliveries-listing route so the two can never drift apart.
export const MAX_DELIVERIES_PER_WEBHOOK = 25;

const WEBHOOK_SECRET_PREFIX = 'thwhk_';

/**
 * Mints a new webhook signing secret. Mirrors the shape of `generateApiKey` in
 * `app-service.ts`, but unlike API keys the raw secret must be *stored* (not just hashed) since
 * it's needed to (re-)compute the HMAC on every delivery.
 */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

/** Masks a secret for display, e.g. `thwhk_...ab12`, never re-derivable to the full value. */
export function maskWebhookSecret(secret: string): string {
  const visibleSuffix = secret.slice(-4);
  return `${WEBHOOK_SECRET_PREFIX}...${visibleSuffix}`;
}

/** Signs `rawBody` with `secret`, producing the `X-Thoth-Signature` header value. */
export function signPayload(secret: string, rawBody: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${hmac}`;
}

export type RecordDeliveryInput = {
  webhookId: string;
  appId: string;
  event: WebhookPayload['event'];
  containerId: string;
  payload: WebhookPayload;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  error: string | null;
};

/**
 * Creates a new `webhook-delivery` row for a fresh (non-resend) delivery attempt, then prunes
 * anything beyond the newest `MAX_DELIVERIES_PER_WEBHOOK` rows for that `webhookId` — same
 * delete-loop style as `replaceScopedContainers` in `app-scope-service.ts`.
 */
export async function recordAndPrune(input: RecordDeliveryInput): Promise<WebhookDelivery> {
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();

  const now = new Date().toISOString();
  const created = await webhookDeliveryRepository.create({
    webhookId: input.webhookId,
    appId: input.appId,
    event: input.event,
    containerId: input.containerId,
    payload: input.payload,
    status: input.status,
    httpStatus: input.httpStatus,
    error: input.error,
    attempts: 1,
    createdAt: now,
    lastAttemptAt: now,
  });

  const existing = await webhookDeliveryRepository.getByQuery(
    webhookDeliveryRepository.createQuery().eq('webhookId', input.webhookId).sort('createdAt', 'desc')
  );

  const toDelete = existing.slice(MAX_DELIVERIES_PER_WEBHOOK);
  for (const row of toDelete) {
    await webhookDeliveryRepository.deleteUsingId(row.id);
  }

  return created;
}

/** Deletes a single `webhook` and all of its `webhook-delivery` rows. */
export async function deleteWebhook(webhookId: string): Promise<void> {
  const webhookRepository = await getWebhookRepository();
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();

  const deliveries = await webhookDeliveryRepository.getByQuery(
    webhookDeliveryRepository.createQuery().eq('webhookId', webhookId)
  );
  for (const delivery of deliveries) {
    await webhookDeliveryRepository.deleteUsingId(delivery.id);
  }

  await webhookRepository.deleteUsingId(webhookId);
}

/** Deletes every `webhook` (+ its deliveries) owned by an App — used on App archive. */
export async function deleteWebhooksForApp(appId: string): Promise<void> {
  const webhookRepository = await getWebhookRepository();
  const webhooks = await webhookRepository.getByQuery(webhookRepository.createQuery().eq('appId', appId));

  for (const webhook of webhooks) {
    await deleteWebhook(webhook.id);
  }
}

export async function listWebhooksForApp(appId: string): Promise<Webhook[]> {
  const webhookRepository = await getWebhookRepository();
  return webhookRepository.getByQuery(webhookRepository.createQuery().eq('appId', appId).sort('createdAt', 'desc'));
}
