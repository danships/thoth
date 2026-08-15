import { z } from 'zod';
import { withIdSchema } from '../utilities.js';

// Lifecycle mirrors `webhook-delivery-status` (THOTH-061 / THOTH-071):
//   pending / retrying — in-flight, owned by the jobs process
//   sent — 2xx from the push provider
//   failed — terminal non-retryable (other 4xx)
//   expired — 404/410 from the provider; parent push-subscription is disabled
//   cancelled — no attempt was ever made (e.g. subscription disabled before send)
export const notificationDeliveryStatusSchema = z.enum([
  'pending',
  'retrying',
  'sent',
  'failed',
  'expired',
  'cancelled',
]);
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>;

export const TERMINAL_NOTIFICATION_DELIVERY_STATUSES: readonly NotificationDeliveryStatus[] = [
  'sent',
  'failed',
  'expired',
  'cancelled',
];

// One Web Push attempt stream. Payload/`title`/`body` are NOT stored — the parent
// `notification` row already has the frozen title/body. Only sanitized outcome fields are
// stored (never raw response bodies, never secret material).
export const notificationDeliverySchema = z
  .object({
    notificationId: z.string().min(1),
    pushSubscriptionId: z.string().min(1),
    status: notificationDeliveryStatusSchema,
    attempts: z.number().int().min(0),
    httpStatus: z.number().int().nullable(),
    errorCode: z.string().max(200).nullable(),
    createdAt: z.string(),
    lastAttemptAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .extend(withIdSchema.shape);

export type NotificationDeliverySchema = z.infer<typeof notificationDeliverySchema>;
