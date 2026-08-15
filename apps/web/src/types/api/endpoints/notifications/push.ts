import { z } from 'zod';
import { quietScheduleSchema, mutedUntilSchema } from '@thoth/database/notifications/mute';
import type { DataWrapper } from '../../utilities';

/** GET /notifications/push-config */
export const getPushConfigResponseSchema = z.object({
  enabled: z.boolean(),
  publicKey: z.string().nullable(),
});
export type GetPushConfigResponse = z.infer<typeof getPushConfigResponseSchema>;
export type GetPushConfigResponseData = DataWrapper<GetPushConfigResponse>;

/** POST /notifications/push-subscriptions */
export const registerPushSubscriptionBodySchema = z
  .object({
    endpoint: z
      .url()
      .max(4096)
      .refine((v) => v.startsWith('https://'), 'Endpoint must be an https URL'),
    expirationTime: z.number().int().nullable(),
    keys: z
      .object({
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(200),
      })
      .strict(),
    userAgentLabel: z.string().max(100).optional(),
  })
  .strict();
export type RegisterPushSubscriptionBody = z.infer<typeof registerPushSubscriptionBodySchema>;

export const registerPushSubscriptionResponseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
});
export type RegisterPushSubscriptionResponse = z.infer<typeof registerPushSubscriptionResponseSchema>;
export type RegisterPushSubscriptionResponseData = DataWrapper<RegisterPushSubscriptionResponse>;

/** DELETE /notifications/push-subscriptions/{id} */
export const deletePushSubscriptionParametersSchema = z.object({ id: z.string().min(1) });
export type DeletePushSubscriptionParameters = z.infer<typeof deletePushSubscriptionParametersSchema>;

export const deletePushSubscriptionResponseSchema = z.object({ id: z.string() });
export type DeletePushSubscriptionResponse = z.infer<typeof deletePushSubscriptionResponseSchema>;
export type DeletePushSubscriptionResponseData = DataWrapper<DeletePushSubscriptionResponse>;

/** GET/PATCH /notifications/settings */
export const notificationSettingsResponseSchema = z.object({
  quietSchedule: quietScheduleSchema,
  timezone: z.string(),
  isMutedNow: z.boolean(),
  muteReason: z.union([z.literal('temporary_mute'), z.literal('quiet_schedule'), z.null()]),
  mutedUntil: mutedUntilSchema,
});
export type NotificationSettingsResponse = z.infer<typeof notificationSettingsResponseSchema>;
export type NotificationSettingsResponseData = DataWrapper<NotificationSettingsResponse>;

export const patchNotificationSettingsBodySchema = z
  .object({
    quietSchedule: quietScheduleSchema,
  })
  .strict();
export type PatchNotificationSettingsBody = z.infer<typeof patchNotificationSettingsBodySchema>;

/** POST/DELETE /notifications/mute */
export const postNotificationMuteBodySchema = z.union([
  z.object({ preset: z.enum(['1h', '2h', '1d']) }).strict(),
  z.object({ until: z.iso.datetime({ offset: true }) }).strict(),
]);
export type PostNotificationMuteBody = z.infer<typeof postNotificationMuteBodySchema>;

export const notificationMuteResponseSchema = z.object({
  mutedUntil: mutedUntilSchema,
  isMutedNow: z.boolean(),
  muteReason: z.union([z.literal('temporary_mute'), z.literal('quiet_schedule'), z.null()]),
});
export type NotificationMuteResponse = z.infer<typeof notificationMuteResponseSchema>;
export type NotificationMuteResponseData = DataWrapper<NotificationMuteResponse>;

// Re-export the underlying IANA validation so route handlers use the SAME rule as the
// evaluator without re-declaring it.
export { ianaTimezoneSchema, quietScheduleSchema, mutedUntilSchema } from '@thoth/database/notifications/mute';
