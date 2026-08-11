// DB-pure webhook persistence (secret minting/masking/signing, delivery recording/pruning,
// deletion) moved to `@thoth/database` (THOTH-058). `WebhookResponse`/`WebhookDeliveryResponse`
// mapping stays web-owned here since it depends on `@/types/api`, which the shared package must
// not import.
export {
  MAX_DELIVERIES_PER_WEBHOOK,
  generateWebhookSecret,
  maskWebhookSecret,
  signPayload,
  recordAndPrune,
  deleteWebhook,
  deleteWebhooksForApp,
  listWebhooksForApp,
  type RecordDeliveryInput,
} from '@thoth/database';
import { maskWebhookSecret } from '@thoth/database';
import type { Webhook, WebhookDelivery } from '@thoth/database/types';
import type { WebhookDeliveryResponse, WebhookResponse } from '@/types/api';

/** Shared `Webhook` -> `WebhookResponse` mapper — used by every route that returns a webhook. */
export function toWebhookResponse(webhook: Webhook): WebhookResponse {
  return {
    id: webhook.id,
    appId: webhook.appId,
    workspaceId: webhook.workspaceId,
    label: webhook.label,
    url: webhook.url,
    enabled: webhook.enabled,
    suppressOwnChanges: webhook.suppressOwnChanges,
    secretMasked: maskWebhookSecret(webhook.secret),
    createdAt: webhook.createdAt,
    lastUpdated: webhook.lastUpdated,
  };
}

/** Shared `WebhookDelivery` -> `WebhookDeliveryResponse` mapper — used by the deliveries-listing and resend routes. */
export function toDeliveryResponse(delivery: WebhookDelivery): WebhookDeliveryResponse {
  return {
    id: delivery.id,
    event: delivery.event,
    containerId: delivery.containerId,
    status: delivery.status,
    httpStatus: delivery.httpStatus,
    error: delivery.error,
    attempts: delivery.attempts,
    createdAt: delivery.createdAt,
    lastAttemptAt: delivery.lastAttemptAt,
  };
}
