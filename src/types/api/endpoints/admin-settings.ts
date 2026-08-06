import { z } from 'zod';
import type { DataWrapper } from '../utilities';

// Admin platform settings (`GET`/`PATCH /admin/settings`). Platform-admin only; cookie sessions
// only. NOT registered in the OpenAPI document (see `src/lib/openapi/registry.ts`).
export const ADMIN_SETTINGS_ENDPOINT = '/admin/settings';

const quotaBytesSchema = z.number().int().nonnegative().nullable();

export const adminSettingsResponseSchema = z.object({
  allowUserWorkspaceCreation: z.boolean(),
  // `null` means "no platform-wide limit"; `0` disables all uploads platform-wide.
  storageQuotaBytes: quotaBytesSchema,
  // Platform-wide total of all uploaded-file bytes.
  usedBytes: z.number().int().nonnegative(),
});
export type AdminSettingsResponse = z.infer<typeof adminSettingsResponseSchema>;
export type AdminSettingsResponseData = DataWrapper<AdminSettingsResponse>;

// At least one field must be provided; unknown fields are rejected. An empty body is a 400.
export const updateAdminSettingsBodySchema = z
  .object({
    allowUserWorkspaceCreation: z.boolean().optional(),
    storageQuotaBytes: quotaBytesSchema.optional(),
  })
  .strict()
  .refine((body) => body.allowUserWorkspaceCreation !== undefined || body.storageQuotaBytes !== undefined, {
    message: 'At least one setting must be provided',
  });
export type UpdateAdminSettingsBody = z.infer<typeof updateAdminSettingsBodySchema>;
