import { z } from 'zod';
import { appSchema } from '../entities';
import type { DataWrapper } from '../utilities';

// Container summary attached to an App's response — hydrated from `AppScopedContainer` (+
// `Container`) rows when `scopeType !== 'workspace'`.
export const appContainerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['page', 'data-source']),
  // Only present when the App's `scopeType` is `'containers_with_children'` — the number of
  // descendants resolved dynamically for this root, via the same helper used for enforcement.
  childCount: z.number().int().min(0).optional(),
});
export type AppContainerSummary = z.infer<typeof appContainerSummarySchema>;

export const appResponseSchema = appSchema.extend({
  containers: z.array(appContainerSummarySchema).optional(),
  keyCount: z.number().int().min(0),
});
export type AppResponse = z.infer<typeof appResponseSchema>;
export type AppResponseData = DataWrapper<AppResponse>;

/** POST /apps */
export const CREATE_APP_ENDPOINT = '/apps';

export const createAppBodySchema = z.object({
  workspaceId: z.string().min(1),
  label: z.string().min(1).max(100),
  permission: appSchema.shape.permission,
  scopeType: appSchema.shape.scopeType,
  // No longer required to be non-empty for non-workspace scopes: a page can be granted access
  // later from its own "Apps" menu (see `POST /pages/:id/apps`), so an App can legitimately be
  // created with an empty container scope and populated afterwards.
  containerIds: z.array(z.string().min(1)).optional(),
  attributionMode: appSchema.shape.attributionMode,
});
export type CreateAppBody = z.infer<typeof createAppBodySchema>;

export const createAppResponseSchema = appResponseSchema;
export type CreateAppResponse = z.infer<typeof createAppResponseSchema>;
export type CreateAppResponseData = DataWrapper<CreateAppResponse>;

/** GET /apps */
export const GET_APPS_ENDPOINT = '/apps';

export const listAppsQuerySchema = z.object({
  workspaceId: z.string().min(1),
});
export type ListAppsQuery = z.infer<typeof listAppsQuerySchema>;

export const getAppsResponseSchema = z.object({
  apps: z.array(appResponseSchema),
});
export type GetAppsResponse = z.infer<typeof getAppsResponseSchema>;
export type GetAppsResponseData = DataWrapper<GetAppsResponse>;

/** GET/PATCH/DELETE /apps/:id */
export const appParametersSchema = z.object({
  id: z.string().min(1),
});
export type AppParameters = z.infer<typeof appParametersSchema>;

export const appDetailResponseSchema = appResponseSchema.extend({
  keys: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      keyPrefix: z.string(),
      expiresAt: z.string().nullable(),
      lastUsedAt: z.string().nullable(),
      revokedAt: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
  createdByDisplayName: z.string(),
});
export type AppDetailResponse = z.infer<typeof appDetailResponseSchema>;
export type AppDetailResponseData = DataWrapper<AppDetailResponse>;

export const updateAppBodySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  permission: appSchema.shape.permission.optional(),
  scopeType: appSchema.shape.scopeType.optional(),
  containerIds: z.array(z.string().min(1)).optional(),
  attributionMode: appSchema.shape.attributionMode.optional(),
});
export type UpdateAppBody = z.infer<typeof updateAppBodySchema>;

export const updateAppResponseSchema = appResponseSchema;
export type UpdateAppResponse = z.infer<typeof updateAppResponseSchema>;
export type UpdateAppResponseData = DataWrapper<UpdateAppResponse>;
