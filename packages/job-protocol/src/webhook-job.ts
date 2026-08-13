import { z } from 'zod';
import { pageValueSchema } from '@thoth/database';

/**
 * External, strictly-validated schemas for the two externally-reachable webhook job types
 * (THOTH-061): `webhook.dispatch` (submitted by `apps/web` page-mutation routes) and
 * `webhook.redeliver` (submitted by the manual-resend route). Both are production job types —
 * unlike `test.noop` in `external-job.ts`, they are NOT gated behind `NODE_ENV === 'test'`.
 *
 * The dispatch payload deliberately excludes sessions, access grants, page content/full entity,
 * webhook ids/URLs/secrets, and rendered bodies (see the THOTH-061 spec) — `@thoth/jobs`' worker
 * reloads all of that itself at execution time from the current DB state. `valueChanges` is
 * bounded (entry count + per-value shape via `pageValueSchema`, itself already a bounded
 * discriminated union) to keep worst-case requests comfortably below the socket frame limit.
 */

const MAX_VALUE_CHANGE_ENTRIES = 250;

export const webhookActorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: z.string().min(1).max(200) }).strict(),
  z
    .object({ type: z.literal('app'), appId: z.string().min(1).max(200), userId: z.string().min(1).max(200) })
    .strict(),
]);
export type WebhookActor = z.infer<typeof webhookActorSchema>;

export const webhookValueChangeSchema = z
  .object({
    previous: pageValueSchema.nullable(),
    new: pageValueSchema.nullable(),
  })
  .strict();

export const webhookValueChangesSchema = z
  .record(z.string().min(1).max(200), webhookValueChangeSchema)
  .refine((changes) => Object.keys(changes).length <= MAX_VALUE_CHANGE_ENTRIES, {
    message: `valueChanges may not contain more than ${MAX_VALUE_CHANGE_ENTRIES} entries`,
  });

export const webhookDispatchEventSchema = z.enum(['page.created', 'page.updated']);

export const webhookDispatchPayloadV1Schema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    containerId: z.string().min(1).max(200),
    event: webhookDispatchEventSchema,
    actor: webhookActorSchema,
    valueChanges: webhookValueChangesSchema.optional(),
  })
  .strict();
export type WebhookDispatchPayloadV1 = z.infer<typeof webhookDispatchPayloadV1Schema>;

export const webhookDispatchExternalJobRequestSchema = z
  .object({
    type: z.literal('webhook.dispatch'),
    payloadVersion: z.literal(1),
    payload: webhookDispatchPayloadV1Schema,
  })
  .strict();
export type WebhookDispatchExternalJobRequest = z.infer<typeof webhookDispatchExternalJobRequestSchema>;

export const webhookRedeliverPayloadV1Schema = z
  .object({
    deliveryId: z.string().min(1).max(200),
    // Request-derived idempotency token (e.g. a UUID minted once per resend click) so a
    // retried/duplicated submit of the *same* logical resend request doesn't need to be
    // distinguished from a genuinely new resend by the caller — the service still enforces "no
    // competing attempts for one row" via the delivery's own status, this token is accepted for
    // future request-level dedupe and bounded defensively regardless.
    idempotencyToken: z.string().min(1).max(200),
  })
  .strict();
export type WebhookRedeliverPayloadV1 = z.infer<typeof webhookRedeliverPayloadV1Schema>;

export const webhookRedeliverExternalJobRequestSchema = z
  .object({
    type: z.literal('webhook.redeliver'),
    payloadVersion: z.literal(1),
    payload: webhookRedeliverPayloadV1Schema,
  })
  .strict();
export type WebhookRedeliverExternalJobRequest = z.infer<typeof webhookRedeliverExternalJobRequestSchema>;
