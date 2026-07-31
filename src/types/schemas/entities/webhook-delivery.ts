import { z } from 'zod';
import { withIdSchema } from '../utilities';

export const webhookDeliveryEventSchema = z.enum(['page.created', 'page.updated']);
export type WebhookDeliveryEvent = z.infer<typeof webhookDeliveryEventSchema>;

export const webhookDeliveryStatusSchema = z.enum(['success', 'failed']);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

// The primitive union stored/emitted for a page's data-source column values in a webhook
// payload — no internal column/option ids ever appear here (single-select is resolved to its
// option label, multi-select to an array of option labels, before this point). See
// `buildPayload` in `src/lib/webhooks/build-payload.ts`.
export const webhookRawValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);
export type WebhookRawValue = z.infer<typeof webhookRawValueSchema>;

export const webhookPayloadPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  type: z.literal('page'),
  lastUpdated: z.string(),
});

// The exact outbound POST body — stored verbatim on `webhook-delivery.payload` so a resend
// replays it without re-resolving column names/labels (see THOTH-031 spec, "duplicate/renamed
// column names" edge case). `values`/`changes` are keyed by column *name*, never by internal id.
export const webhookPayloadSchema = z.object({
  event: webhookDeliveryEventSchema,
  deliveryId: z.string(),
  timestamp: z.string(),
  workspaceId: z.string(),
  appId: z.string(),
  page: webhookPayloadPageSchema,
  dataSourceId: z.string().optional(),
  values: z.record(z.string(), webhookRawValueSchema).optional(),
  changes: z
    .record(z.string(), z.object({ previous: webhookRawValueSchema.nullable(), new: webhookRawValueSchema.nullable() }))
    .optional(),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// A single delivery-attempt history row for a `webhook`. See
// `src/lib/database/entities/webhook-delivery.ts` for the 25-row-per-webhook cap and
// `src/lib/database/webhook-service.ts` for the prune/resend implementation.
export const webhookDeliverySchema = z
  .object({
    webhookId: z.string().min(1),
    appId: z.string().min(1),
    event: webhookDeliveryEventSchema,
    containerId: z.string().min(1),
    payload: webhookPayloadSchema,
    status: webhookDeliveryStatusSchema,
    httpStatus: z.number().int().nullable(),
    error: z.string().max(500).nullable(),
    attempts: z.number().int().min(0),
    createdAt: z.string(),
    lastAttemptAt: z.string(),
  })
  .extend(withIdSchema.shape);

export type WebhookDeliverySchema = z.infer<typeof webhookDeliverySchema>;
