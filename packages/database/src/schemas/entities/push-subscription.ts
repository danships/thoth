import { z } from 'zod';
import { withIdSchema, withUserIdSchema } from '../utilities.js';

// One browser/service-worker Web Push registration for one human (THOTH-071). Endpoint plus the
// `p256dh`/`auth` keys are the RFC8291 payload-encryption inputs sent by the browser via
// `PushSubscription.toJSON()` — never returned to any client after registration.
export const pushSubscriptionSchema = z
  .object({
    // Push endpoint — always https, provider-issued (FCM/Mozilla/Apple/...). Bound length so a
    // pathological input cannot bloat storage or logs. Explicitly enforces the `https:` protocol
    // here (not just "any URL") so the HTTPS invariant is a schema-level guarantee, matching the
    // delivery-time SSRF/protocol check in `apps/jobs/src/handlers/notifications/deliver.ts`
    // (which additionally rejects private/loopback/link-local hosts — a check this schema alone
    // cannot express, since a hostname's resolved address isn't known at validation time).
    endpoint: z
      .url()
      .max(4096)
      .refine((value) => new URL(value).protocol === 'https:', 'endpoint must use the https protocol'),
    expirationTime: z.number().int().nullable(),
    keys: z
      .object({
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(200),
      })
      .strict(),
    // Optional short label (browser/OS marker) the client may attach at registration purely to
    // help humans distinguish their own devices in a list.
    userAgentLabel: z.string().max(100).nullable(),
    // Non-null once the subscription is explicitly disabled (client `unsubscribe()`, or a 404/
    // 410 seen by a delivery attempt). Delivery skips a subscription with any non-null value.
    disabledAt: z.string().nullable(),
    lastSeenAt: z.string(),
    createdAt: z.string(),
  })
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export type PushSubscriptionSchema = z.infer<typeof pushSubscriptionSchema>;
