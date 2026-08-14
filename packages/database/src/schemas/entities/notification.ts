import { z } from 'zod';
import { withIdSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities.js';
import { notificationActorSchema } from './notification-actor.js';

// One immutable, fully-rendered inbox item for one recipient for one dispatch (THOTH-066).
// `title`/`body` are frozen at creation time (never re-derived on read) so a later page rename
// or actor deletion never rewrites already-delivered history — see
// `packages/database/src/notification-service.ts#renderNotificationTitleBody`.
export const notificationDispatchEventSchema = z.enum(['page.created', 'page.updated']);
export type NotificationDispatchEvent = z.infer<typeof notificationDispatchEventSchema>;

export const notificationSchema = z
  .object({
    containerId: z.string().min(1),
    event: notificationDispatchEventSchema,
    actor: notificationActorSchema,
    title: z.string().min(1).max(200),
    body: z.string().max(1000),
    changeCount: z.number().int().min(0),
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
