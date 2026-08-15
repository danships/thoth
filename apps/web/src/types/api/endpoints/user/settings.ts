import { z } from 'zod';
import { ianaTimezoneSchema } from '@thoth/database/notifications/mute';
import type { DataWrapper } from '../../utilities';

/** GET /user/settings */
export const getUserSettingsResponseSchema = z.object({
  timezone: z.string(),
});
export type GetUserSettingsResponse = z.infer<typeof getUserSettingsResponseSchema>;
export type GetUserSettingsResponseData = DataWrapper<GetUserSettingsResponse>;

/** PATCH /user/settings */
export const patchUserSettingsBodySchema = z
  .object({
    timezone: ianaTimezoneSchema,
  })
  .strict();
export type PatchUserSettingsBody = z.infer<typeof patchUserSettingsBodySchema>;

export const patchUserSettingsResponseSchema = getUserSettingsResponseSchema;
export type PatchUserSettingsResponse = z.infer<typeof patchUserSettingsResponseSchema>;
export type PatchUserSettingsResponseData = DataWrapper<PatchUserSettingsResponse>;
