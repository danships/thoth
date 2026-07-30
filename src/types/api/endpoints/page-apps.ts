import { z } from 'zod';
import { appPermissionSchema, appScopeTypeSchema } from '../../schemas/entities/app';
import type { DataWrapper } from '../utilities';

/** GET /pages/:id/apps */
export const GET_PAGE_APPS_ENDPOINT = (pageId: string) => `/pages/${pageId}/apps`;

export const pageAppsParametersSchema = z.object({
  id: z.string().min(1),
});
export type PageAppsParameters = z.infer<typeof pageAppsParametersSchema>;

// A minimal, page-scoped view of an App — just enough for the page detail "Apps" menu to
// list/connect/disconnect. Never includes keys or the full container list.
export const pageAppSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  permission: appPermissionSchema,
  scopeType: appScopeTypeSchema,
});
export type PageAppSummary = z.infer<typeof pageAppSummarySchema>;

// A connected App entry. `viaWorkspace` marks an implicit workspace-scoped grant; `viaInheritance`
// marks a `containers_with_children` grant inherited from an ancestor container (a parent page,
// or a page that embeds this container's data source). Both are shown as connected but are not
// disconnectable from here — change the App's scope to remove them.
export const connectedPageAppSchema = pageAppSummarySchema.extend({
  viaWorkspace: z.boolean(),
  viaInheritance: z.boolean().optional(),
});
export type ConnectedPageApp = z.infer<typeof connectedPageAppSchema>;

export const getPageAppsResponseSchema = z.object({
  // Apps that currently grant access to this page: `scopeType: 'workspace'` Apps (implicitly,
  // for every page), `containers`/`containers_with_children` Apps that directly list this page,
  // and `containers_with_children` Apps that reach it via an ancestor (`viaInheritance`).
  connected: z.array(connectedPageAppSchema),
  // Other non-workspace-scoped, non-archived Apps in the same workspace that this page could
  // be connected to.
  connectable: z.array(pageAppSummarySchema),
});
export type GetPageAppsResponse = z.infer<typeof getPageAppsResponseSchema>;
export type GetPageAppsResponseData = DataWrapper<GetPageAppsResponse>;

/** POST /pages/:id/apps */
export const POST_PAGE_APPS_ENDPOINT = (pageId: string) => `/pages/${pageId}/apps`;

export const connectPageAppBodySchema = z.object({
  appId: z.string().min(1),
});
export type ConnectPageAppBody = z.infer<typeof connectPageAppBodySchema>;

export const connectPageAppResponseSchema = pageAppSummarySchema
  .extend({
    viaWorkspace: z.boolean(),
  })
  .meta({ id: 'ConnectedPageApp' });
export type ConnectPageAppResponse = z.infer<typeof connectPageAppResponseSchema>;
export type ConnectPageAppResponseData = DataWrapper<ConnectPageAppResponse>;

/** DELETE /pages/:id/apps/:appId */
export const DELETE_PAGE_APP_ENDPOINT = (pageId: string, appId: string) => `/pages/${pageId}/apps/${appId}`;

export const disconnectPageAppParametersSchema = z.object({
  id: z.string().min(1),
  appId: z.string().min(1),
});
export type DisconnectPageAppParameters = z.infer<typeof disconnectPageAppParametersSchema>;
