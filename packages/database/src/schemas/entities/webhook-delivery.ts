import { z } from 'zod';
import { withIdSchema } from '../utilities.js';

export const webhookDeliveryEventSchema = z.enum(['page.created', 'page.updated']);
export type WebhookDeliveryEvent = z.infer<typeof webhookDeliveryEventSchema>;

// `pending`/`retrying` are in-flight states owned by the jobs process (THOTH-061); `success`/
// `failed`/`cancelled` are terminal. `cancelled` covers a delivery whose webhook became
// missing/disabled before an attempt was made.
export const webhookDeliveryStatusSchema = z.enum(['pending', 'retrying', 'success', 'failed', 'cancelled']);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const TERMINAL_WEBHOOK_DELIVERY_STATUSES: readonly WebhookDeliveryStatus[] = ['success', 'failed', 'cancelled'];

// The primitive union stored/emitted for a page's data-source column values in a webhook
// payload — no internal column/option ids ever appear here (single-select is resolved to its
// option label, multi-select to an array of option labels, before this point). See
// `buildPayload` in `src/lib/webhooks/build-payload.ts`.
export const webhookRawValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.object({ id: z.string(), filename: z.string().nullable(), url: z.string() }),
]);
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

// One row = the immutable payload for one destination plus its mutable attempt history
// (THOTH-061). See `packages/database/src/entities/webhook-delivery.ts` for the 25-*terminal*-
// row-per-webhook cap and `packages/database/src/webhook-delivery-service.ts` for the
// create/attempt/retry/prune implementation. `lastAttemptAt`/`nextAttemptAt`/`completedAt` are
// all nullable: a freshly created `pending` row has made no attempt yet, and only a `retrying`
// row ever has a `nextAttemptAt`.
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
    // The `webhook.dispatch` job that produced this delivery row, if any — `null` for legacy
    // rows created before THOTH-061. Used to find/reuse the row for a given (sourceJobId,
    // webhookId) pair when a dispatch handler resumes after a crash.
    sourceJobId: z.string().nullable(),
    createdAt: z.string(),
    lastAttemptAt: z.string().nullable(),
    // Set only while `status === 'retrying'` — the earliest time the next attempt may run.
    nextAttemptAt: z.string().nullable(),
    // Set once the row reaches a terminal status (`success`/`failed`/`cancelled`).
    completedAt: z.string().nullable(),
  })
  .extend(withIdSchema.shape);

export type WebhookDeliverySchema = z.infer<typeof webhookDeliverySchema>;
