import crypto from 'node:crypto';
import { getWebhookDeliveryRepository, getWebhookRepository } from './repositories.js';
import type { Webhook, WebhookDelivery, WebhookPayload } from './types.js';

// Cap on how many *terminal* `webhook-delivery` rows are retained per webhook — see
// `pruneTerminalDeliveries`. Also reused as the `.limit()` on the deliveries-listing route so
// the two can never drift apart.
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

export type CreatePendingDeliveryInput = {
  webhookId: string;
  appId: string;
  event: WebhookPayload['event'];
  containerId: string;
  payload: WebhookPayload;
  /** The `webhook.dispatch` job id that produced this row — used for crash-recovery lookup. */
  sourceJobId: string | null;
};

/**
 * Creates a fresh `pending` `webhook-delivery` row for a not-yet-attempted destination
 * (THOTH-061). No attempt has been made yet, so `lastAttemptAt`/`nextAttemptAt`/`completedAt`
 * all start `null` and `attempts` starts at `0` — the first `recordDeliveryAttempt` call is what
 * increments it. Never prunes here: pruning only ever removes *terminal* rows (see
 * `pruneTerminalDeliveries`), and this row isn't terminal yet.
 */
export async function createPendingDelivery(input: CreatePendingDeliveryInput): Promise<WebhookDelivery> {
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const now = new Date().toISOString();

  return webhookDeliveryRepository.create({
    webhookId: input.webhookId,
    appId: input.appId,
    event: input.event,
    containerId: input.containerId,
    payload: input.payload,
    status: 'pending',
    httpStatus: null,
    error: null,
    attempts: 0,
    sourceJobId: input.sourceJobId,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: null,
    completedAt: null,
  });
}

/**
 * Finds the delivery row already created for a given `webhook.dispatch` job + destination
 * webhook pair, if any. Used by the dispatch handler so a repeated/crashed dispatch resumes
 * instead of creating a duplicate delivery row (and thus a duplicate outbound payload) for the
 * same fan-out target.
 */
export async function findDeliveryBySourceJobAndWebhook(
  sourceJobId: string,
  webhookId: string
): Promise<WebhookDelivery | undefined> {
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const delivery = await webhookDeliveryRepository.getOneByQuery(
    webhookDeliveryRepository.createQuery().eq('sourceJobId', sourceJobId).eq('webhookId', webhookId)
  );
  return delivery ?? undefined;
}

export type DeliveryAttemptOutcome =
  | { outcome: 'success'; httpStatus: number }
  | { outcome: 'failed'; httpStatus: number | null; error: string }
  | { outcome: 'retrying'; httpStatus: number | null; error: string; nextAttemptAt: string }
  | { outcome: 'cancelled' };

const TERMINAL_OUTCOMES = new Set(['success', 'failed', 'cancelled']);

/**
 * Records the outcome of one delivery attempt against an existing row (THOTH-061) — the single
 * place `attempts`/`status`/`lastAttemptAt`/`nextAttemptAt`/`completedAt` are updated. A
 * `cancelled` outcome (webhook missing/disabled, checked before any network call) does not count
 * as an attempt and leaves `lastAttemptAt` untouched. Terminal outcomes trigger
 * `pruneTerminalDeliveries` for the same webhook. Returns `undefined` (a safe no-op) if the row
 * no longer exists (e.g. the webhook/App was deleted concurrently).
 */
export async function recordDeliveryAttempt(
  deliveryId: string,
  result: DeliveryAttemptOutcome
): Promise<WebhookDelivery | undefined> {
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const delivery = await webhookDeliveryRepository.getOneByQuery(
    webhookDeliveryRepository.createQuery().eq('id', deliveryId)
  );
  if (!delivery) {
    return undefined;
  }

  const now = new Date().toISOString();
  const isAttempt = result.outcome !== 'cancelled';
  const isTerminal = TERMINAL_OUTCOMES.has(result.outcome);

  const updated = await webhookDeliveryRepository.update({
    ...delivery,
    status: result.outcome,
    httpStatus: 'httpStatus' in result ? result.httpStatus : null,
    error: 'error' in result ? result.error : null,
    attempts: isAttempt ? delivery.attempts + 1 : delivery.attempts,
    lastAttemptAt: isAttempt ? now : delivery.lastAttemptAt,
    nextAttemptAt: result.outcome === 'retrying' ? result.nextAttemptAt : null,
    completedAt: isTerminal ? now : null,
  });

  if (isTerminal) {
    await pruneTerminalDeliveries(delivery.webhookId);
  }

  return updated;
}

/** Convenience wrapper over `recordDeliveryAttempt` for the retryable-failure path. */
export async function scheduleDeliveryRetry(
  deliveryId: string,
  input: { httpStatus: number | null; error: string; nextAttemptAt: string }
): Promise<WebhookDelivery | undefined> {
  return recordDeliveryAttempt(deliveryId, { outcome: 'retrying', ...input });
}

/** Convenience wrapper over `recordDeliveryAttempt` for a terminal outcome. */
export async function completeDelivery(
  deliveryId: string,
  outcome:
    | { status: 'success'; httpStatus: number }
    | { status: 'failed'; httpStatus: number | null; error: string }
    | { status: 'cancelled' }
): Promise<WebhookDelivery | undefined> {
  if (outcome.status === 'cancelled') {
    return recordDeliveryAttempt(deliveryId, { outcome: 'cancelled' });
  }
  if (outcome.status === 'success') {
    return recordDeliveryAttempt(deliveryId, { outcome: 'success', httpStatus: outcome.httpStatus });
  }
  return recordDeliveryAttempt(deliveryId, { outcome: 'failed', httpStatus: outcome.httpStatus, error: outcome.error });
}

/**
 * Resets a delivery row to `pending` as part of a manual-resend job's accepted setup
 * (THOTH-061) — `attempts` is a lifetime total and is deliberately *not* reset, matching the
 * existing UI contract. Returns `undefined` if the row is missing, and `'already-active'` if the
 * row is already `pending`/`retrying` (the route/job layer maps this to a 409/conflict
 * disposition — never runs two competing attempts for the same row).
 */
export async function resetDeliveryForResend(
  deliveryId: string
): Promise<WebhookDelivery | 'not-found' | 'already-active'> {
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const delivery = await webhookDeliveryRepository.getOneByQuery(
    webhookDeliveryRepository.createQuery().eq('id', deliveryId)
  );
  if (!delivery) {
    return 'not-found';
  }
  if (delivery.status === 'pending' || delivery.status === 'retrying') {
    return 'already-active';
  }

  return webhookDeliveryRepository.update({
    ...delivery,
    status: 'pending',
    httpStatus: null,
    error: null,
    nextAttemptAt: null,
    completedAt: null,
  });
}

/**
 * Prunes terminal (`success`/`failed`/`cancelled`) `webhook-delivery` rows beyond the newest
 * `MAX_DELIVERIES_PER_WEBHOOK` for `webhookId` — `pending`/`retrying` rows are never counted or
 * removed, regardless of age (THOTH-061).
 */
export async function pruneTerminalDeliveries(webhookId: string): Promise<void> {
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const existing = await webhookDeliveryRepository.getByQuery(
    webhookDeliveryRepository.createQuery().eq('webhookId', webhookId).sort('createdAt', 'desc')
  );

  const terminal = existing.filter((row) => ['success', 'failed', 'cancelled'].includes(row.status));
  const toDelete = terminal.slice(MAX_DELIVERIES_PER_WEBHOOK);
  for (const row of toDelete) {
    await webhookDeliveryRepository.deleteUsingId(row.id);
  }
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
