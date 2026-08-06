import { z } from 'zod';
import { platformUserRoleSchema } from '../../schemas/entities/platform-user';
import type { DataWrapper } from '../utilities';

// Admin user list & per-user quota editor (`GET /admin/users`, `PATCH /admin/users/{id}`).
// Platform-admin only; cookie sessions only. NOT registered in the OpenAPI document.
export const ADMIN_USERS_ENDPOINT = '/admin/users';

const quotaBytesSchema = z.number().int().nonnegative().nullable();

export const adminUserItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: platformUserRoleSchema,
  // Per-user storage quota (`null` = no user-level limit).
  storageQuotaBytes: quotaBytesSchema,
  usedBytes: z.number().int().nonnegative(),
});
export type AdminUserItem = z.infer<typeof adminUserItemSchema>;

export const getAdminUsersQuerySchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type GetAdminUsersQuery = z.infer<typeof getAdminUsersQuerySchema>;

export const getAdminUsersResponseSchema = z.object({
  items: z.array(adminUserItemSchema),
  nextCursor: z.string().nullable(),
});
export type GetAdminUsersResponse = z.infer<typeof getAdminUsersResponseSchema>;
export type GetAdminUsersResponseData = DataWrapper<GetAdminUsersResponse>;

export const adminUserParametersSchema = z.object({
  id: z.string().min(1),
});
export type AdminUserParameters = z.infer<typeof adminUserParametersSchema>;

// Only the storage quota is writable — role is deliberately not settable via this endpoint.
export const updateAdminUserBodySchema = z
  .object({
    storageQuotaBytes: quotaBytesSchema,
  })
  .strict();
export type UpdateAdminUserBody = z.infer<typeof updateAdminUserBodySchema>;

export const updateAdminUserResponseSchema = adminUserItemSchema;
export type UpdateAdminUserResponse = z.infer<typeof updateAdminUserResponseSchema>;
export type UpdateAdminUserResponseData = DataWrapper<UpdateAdminUserResponse>;
