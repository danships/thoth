import { z } from 'zod';
import type { DataWrapper } from '../utilities';

// Admin workspace list & per-workspace quota editor (`GET /admin/workspaces`,
// `PATCH /admin/workspaces/{id}`). Platform-admin only; cookie sessions only. Does NOT create or
// require workspace membership. NOT registered in the OpenAPI document.
export const ADMIN_WORKSPACES_ENDPOINT = '/admin/workspaces';

const quotaBytesSchema = z.number().int().nonnegative().nullable();

export const adminWorkspaceItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  deletedAt: z.string().nullable(),
  // Per-workspace storage quota (`null` = no workspace-level limit).
  storageQuotaBytes: quotaBytesSchema,
  usedBytes: z.number().int().nonnegative(),
});
export type AdminWorkspaceItem = z.infer<typeof adminWorkspaceItemSchema>;

export const getAdminWorkspacesQuerySchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  includeDeleted: z.coerce.boolean().optional(),
});
export type GetAdminWorkspacesQuery = z.infer<typeof getAdminWorkspacesQuerySchema>;

export const getAdminWorkspacesResponseSchema = z.object({
  items: z.array(adminWorkspaceItemSchema),
  nextCursor: z.string().nullable(),
});
export type GetAdminWorkspacesResponse = z.infer<typeof getAdminWorkspacesResponseSchema>;
export type GetAdminWorkspacesResponseData = DataWrapper<GetAdminWorkspacesResponse>;

export const adminWorkspaceParametersSchema = z.object({
  id: z.string().min(1),
});
export type AdminWorkspaceParameters = z.infer<typeof adminWorkspaceParametersSchema>;

export const updateAdminWorkspaceBodySchema = z
  .object({
    storageQuotaBytes: quotaBytesSchema,
  })
  .strict();
export type UpdateAdminWorkspaceBody = z.infer<typeof updateAdminWorkspaceBodySchema>;

export const updateAdminWorkspaceResponseSchema = adminWorkspaceItemSchema;
export type UpdateAdminWorkspaceResponse = z.infer<typeof updateAdminWorkspaceResponseSchema>;
export type UpdateAdminWorkspaceResponseData = DataWrapper<UpdateAdminWorkspaceResponse>;
