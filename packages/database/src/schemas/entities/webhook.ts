import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withWorkspaceIdSchema } from '../utilities.js';

// https-only, size-bounded delivery target. Format/SSRF validation (DNS-aware) happens
// separately in `src/lib/webhooks/ssrf.ts` — this schema only enforces shape.
export const webhookUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:', { message: 'url must use the https protocol' });

// A single outbound delivery endpoint configured on an App. See
// `src/lib/database/entities/webhook.ts` for the table's purpose and
// `src/lib/database/webhook-service.ts` for secret generation/rotation.
export const webhookSchema = z
  .object({
    appId: z.string().min(1),
    label: z.string().min(1).max(100),
    url: webhookUrlSchema,
    // Random 32-byte base64url token used to sign payloads (HMAC-SHA256). Never serialized to
    // a client response except in full on create/rotate — see `webhookPublicSchema` below.
    secret: z.string().min(1),
    enabled: z.boolean(),
    suppressOwnChanges: z.boolean(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withIdSchema.shape);

export type WebhookSchema = z.infer<typeof webhookSchema>;

// Every API response is built from this — `secret` is never included, only the masked form
// which routes attach separately (see `WebhookResponse` in `src/types/api/endpoints/webhook.ts`).
export const webhookPublicSchema = webhookSchema.omit({ secret: true });
export type WebhookPublicSchema = z.infer<typeof webhookPublicSchema>;
