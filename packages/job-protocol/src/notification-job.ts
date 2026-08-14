import { z } from 'zod';
import { notificationActorSchema as dbNotificationActorSchema } from '@thoth/database';

/**
 * `notification.dispatch` v1 — the externally-reachable job submitted by `apps/web`'s
 * page-mutation routes (THOTH-066), alongside the existing `webhook.dispatch` job. Reuses the
 * exact same actor discriminated union as `webhookActorSchema` (see `webhook-job.ts`) — imported
 * from `@thoth/database` so both packages share a single source of truth for the shape rather
 * than risking the two definitions drifting apart.
 *
 * The payload deliberately carries only ids / actor / event / times / counts — no page bodies,
 * no rule contents, no sessions/grants/emails. `@thoth/jobs`' handler reloads the page, ancestor
 * chain, rules, and membership itself at execution time (see the THOTH-066 spec's "Job Contract
 * & Processing" section).
 */
export const notificationActorSchema = dbNotificationActorSchema;
export type NotificationActor = z.infer<typeof notificationActorSchema>;

export const notificationDispatchEventSchema = z.enum(['page.created', 'page.updated']);

export const notificationDispatchPayloadV1Schema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    containerId: z.string().min(1).max(200),
    event: notificationDispatchEventSchema,
    actor: notificationActorSchema,
    changeCount: z.number().int().min(0).max(100_000),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type NotificationDispatchPayloadV1 = z.infer<typeof notificationDispatchPayloadV1Schema>;

export const notificationDispatchExternalJobRequestSchema = z
  .object({
    type: z.literal('notification.dispatch'),
    payloadVersion: z.literal(1),
    payload: notificationDispatchPayloadV1Schema,
  })
  .strict();
export type NotificationDispatchExternalJobRequest = z.infer<typeof notificationDispatchExternalJobRequestSchema>;
