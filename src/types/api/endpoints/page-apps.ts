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

export const getPageAppsResponseSchema = z.object({
  // Apps that currently grant access to this page: `scopeType: 'workspace'` Apps (implicitly,
  // for every page) plus `containers`/`containers_with_children` Apps that directly list this
  // page in their scope. `viaWorkspace` distinguishes the former (not disconnectable here — see
  // the App's own settings to change its scope) from the latter (disconnectable).
  connected: z.array(pageAppSummarySchema.extend({ viaWorkspace: z.boolean() })),
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

export type ConnectPageAppResponse = PageAppSummary & { viaWorkspace: boolean };
export type ConnectPageAppResponseData = DataWrapper<ConnectPageAppResponse>;

/** DELETE /pages/:id/apps/:appId */
export const DELETE_PAGE_APP_ENDPOINT = (pageId: string, appId: string) => `/pages/${pageId}/apps/${appId}`;

export const disconnectPageAppParametersSchema = z.object({
  id: z.string().min(1),
  appId: z.string().min(1),
});
export type DisconnectPageAppParameters = z.infer<typeof disconnectPageAppParametersSchema>;
