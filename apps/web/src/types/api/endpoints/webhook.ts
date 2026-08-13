import { z } from 'zod';
import { webhookSchema, webhookDeliverySchema } from '../entities';
import { appParametersSchema } from './app';
import type { DataWrapper } from '../utilities';

/** GET/POST /apps/:id/webhooks */
export const webhookParametersSchema = appParametersSchema;
export type WebhookParameters = z.infer<typeof webhookParametersSchema>;

export const webhookResponseSchema = webhookSchema.extend({
  // Masked form of the secret (e.g. `thwhk_...abcd`) shown on every read; the raw `secret` is
  // only ever attached (see `createWebhookResponseSchema`/`updateWebhookResponseSchema`) on
  // create/rotate.
  secretMasked: z.string(),
});
export type WebhookResponse = z.infer<typeof webhookResponseSchema>;
export type WebhookResponseData = DataWrapper<WebhookResponse>;

export const GET_WEBHOOKS_ENDPOINT = (appId: string) => `/apps/${appId}/webhooks`;

export const getWebhooksResponseSchema = z.object({
  webhooks: z.array(webhookResponseSchema),
});
export type GetWebhooksResponse = z.infer<typeof getWebhooksResponseSchema>;
export type GetWebhooksResponseData = DataWrapper<GetWebhooksResponse>;

export const createWebhookBodySchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().min(1).max(2048),
  enabled: z.boolean().optional(),
  suppressOwnChanges: z.boolean().optional(),
});
export type CreateWebhookBody = z.infer<typeof createWebhookBodySchema>;

// The one-time response: `secret` is the raw signing secret and is never retrievable again.
export const createWebhookResponseSchema = webhookResponseSchema.extend({
  secret: z.string(),
});
export type CreateWebhookResponse = z.infer<typeof createWebhookResponseSchema>;
export type CreateWebhookResponseData = DataWrapper<CreateWebhookResponse>;

/** GET/PATCH/DELETE /apps/:id/webhooks/:webhookId */
export const webhookDetailParametersSchema = z.object({
  id: z.string().min(1),
  webhookId: z.string().min(1),
});
export type WebhookDetailParameters = z.infer<typeof webhookDetailParametersSchema>;

export const updateWebhookBodySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  url: z.string().min(1).max(2048).optional(),
  enabled: z.boolean().optional(),
  suppressOwnChanges: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
});
export type UpdateWebhookBody = z.infer<typeof updateWebhookBodySchema>;

// `secret` is only present when `rotateSecret: true` was supplied.
export const updateWebhookResponseSchema = webhookResponseSchema.extend({
  secret: z.string().optional(),
});
export type UpdateWebhookResponse = z.infer<typeof updateWebhookResponseSchema>;
export type UpdateWebhookResponseData = DataWrapper<UpdateWebhookResponse>;

/** GET /apps/:id/webhooks/:webhookId/deliveries */
export const webhookDeliveriesParametersSchema = webhookDetailParametersSchema;
export type WebhookDeliveriesParameters = z.infer<typeof webhookDeliveriesParametersSchema>;

export const webhookDeliveryResponseSchema = webhookDeliverySchema;
export type WebhookDeliveryResponse = z.infer<typeof webhookDeliveryResponseSchema>;

export const getWebhookDeliveriesResponseSchema = z.object({
  deliveries: z.array(webhookDeliveryResponseSchema),
});
export type GetWebhookDeliveriesResponse = z.infer<typeof getWebhookDeliveriesResponseSchema>;
export type GetWebhookDeliveriesResponseData = DataWrapper<GetWebhookDeliveriesResponse>;

/** POST /apps/:id/webhooks/:webhookId/deliveries/:deliveryId/resend */
export const resendWebhookDeliveryParametersSchema = z.object({
  id: z.string().min(1),
  webhookId: z.string().min(1),
  deliveryId: z.string().min(1),
});
export type ResendWebhookDeliveryParameters = z.infer<typeof resendWebhookDeliveryParametersSchema>;

// Asynchronous: the route submits a `webhook.redeliver` job and returns HTTP 202 immediately
// (THOTH-061) — it never performs an outbound fetch itself. `delivery` reflects the row's state
// right after durable job-service acknowledgement (freshly reset to `pending`); the UI polls the
// deliveries-listing endpoint until the row reaches a terminal status.
export const resendWebhookDeliveryResponseSchema = z.object({
  jobId: z.string(),
  delivery: webhookDeliveryResponseSchema,
});
export type ResendWebhookDeliveryResponse = z.infer<typeof resendWebhookDeliveryResponseSchema>;
export type ResendWebhookDeliveryResponseData = DataWrapper<ResendWebhookDeliveryResponse>;
