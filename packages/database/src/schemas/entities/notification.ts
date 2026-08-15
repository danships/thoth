import { z } from 'zod';
import { withIdSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities.js';
import { notificationActorSchema } from './notification-actor.js';

// One immutable, fully-rendered inbox item for one recipient for one dispatch (THOTH-066).
// `title`/`body` are frozen at creation time (never re-derived on read) so a later page rename
// or actor deletion never rewrites already-delivered history — see
// `packages/database/src/notification-service.ts#renderNotificationTitleBody`.
export const notificationDispatchEventSchema = z.enum(['page.created', 'page.updated']);
export type NotificationDispatchEvent = z.infer<typeof notificationDispatchEventSchema>;

// Summary of the push-side outcome for this inbox row (THOTH-071). `null` means push has not
// yet been evaluated (or push was disabled entirely). Values set by the dispatch handler on
// creation (`muted`/`no_devices`/`queued`) and progressively updated by `notification.deliver`
// as its per-device deliveries reach terminal state (`sent`/`partial`/`failed`).
export const notificationPushDispositionSchema = z.enum([
  'muted',
  'no_devices',
  'queued',
  'sent',
  'partial',
  'failed',
]);
export type NotificationPushDisposition = z.infer<typeof notificationPushDispositionSchema>;

export const notificationSchema = z
  .object({
    containerId: z.string().min(1),
    event: notificationDispatchEventSchema,
    actor: notificationActorSchema,
    title: z.string().min(1).max(200),
    body: z.string().max(1000),
    changeCount: z.number().int().min(0),
    // THOTH-071 additive fields (nullable / default 0 so pre-THOTH-071 rows still parse).
    pushDisposition: notificationPushDispositionSchema.nullable().default(null),
    pushQueuedCount: z.number().int().min(0).default(0),
    pushSentCount: z.number().int().min(0).default(0),
    pushFailedCount: z.number().int().min(0).default(0),
    // The `notification.dispatch` job id that produced this row — used, together with
    // `userId`, as the idempotency key so a crash-recovered re-run of the same dispatch never
    // creates a duplicate inbox item (mirrors `webhook-delivery.sourceJobId`).
    sourceJobId: z.string().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
    createdAt: z.string(),
    readAt: z.string().nullable(),
  })
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);

export type NotificationSchema = z.infer<typeof notificationSchema>;
