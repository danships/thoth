import axios from 'axios';
import { notifications } from '@mantine/notifications';
import type { DataWrapper } from '@/types/api';
import type {
  BatchDeletePagesResponse,
  BatchRestorePagesResponse,
  CreateWorkspaceBody,
  GetDeletedPagesResponse,
  GetDeletedWorkspacesResponse,
  GetPageBreadcrumbsResponse,
  GetPageHistoryResponse,
  GetPageRevisionResponse,
  RestorePageRevisionResponse,
  ForkPageRevisionResponse,
  ForkPageRevisionBody,
  GetWorkspacesResponse,
  GetWorkspaceSlugAvailabilityResponse,
  RestoreDataSourceResponse,
  RestorePageResponse,
  RestoreViewResponse,
  ReorderPageBody,
  ReorderPageResponse,
  UpdateWorkspaceBody,
  WorkspaceApi,
  CreateAppBody,
  UpdateAppBody,
  AppResponse,
  AppDetailResponse,
  GetAppsResponse,
  CreateApiKeyBody,
  CreateApiKeyResponse,
  GetPageAppsResponse,
  ConnectPageAppResponse,
  MutatePageContentResponse,
  GetWebhooksResponse,
  CreateWebhookBody,
  CreateWebhookResponse,
  WebhookResponse,
  UpdateWebhookBody,
  UpdateWebhookResponse,
  GetWebhookDeliveriesResponse,
  ResendWebhookDeliveryResponse,
  UploadFileResponse,
  GetFileResponse,
  DeleteFileResponse,
  GetWorkspaceStorageUsageResponse,
  GetPlatformCapabilitiesResponse,
  AdminSettingsResponse,
  UpdateAdminSettingsBody,
  GetAdminUsersResponse,
  GetAdminUsersQuery,
  UpdateAdminUserBody,
  UpdateAdminUserResponse,
  GetAdminWorkspacesResponse,
  GetAdminWorkspacesQuery,
  UpdateAdminWorkspaceBody,
  UpdateAdminWorkspaceResponse,
} from '@/types/api';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// When a workspace is soft-deleted (in another tab/device) while the user still has it open,
// its scoped API calls start failing `assertWorkspaceAccess` with a 404 "Workspace not found".
// Catch that globally, tell the user, and bounce them to `/` (which re-resolves their remaining
// workspaces server-side). Guarded to the browser so it never runs during SSR.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isWorkspaceGone =
      globalThis.window !== undefined &&
      error?.response?.status === 404 &&
      error?.response?.data?.error === 'Workspace not found';

    if (isWorkspaceGone && globalThis.location.pathname !== '/') {
      notifications.show({
        color: 'red',
        message: 'This workspace is no longer available.',
        autoClose: 5000,
      });
      globalThis.location.assign('/');
    }

    return Promise.reject(error);
  }
);

export const api = {
  // Pages API
  pages: {
    getTree: (options?: { parentId?: string; cursor?: string; limit?: number; workspaceId?: string }) =>
      apiClient.get('/pages/tree', {
        params: {
          ...(options?.parentId && { parentId: options.parentId }),
          ...(options?.cursor && { cursor: options.cursor }),
          ...(options?.limit && { limit: options.limit }),
          ...(options?.workspaceId && { workspaceId: options.workspaceId }),
        },
      }),

    getDetails: (id: string) => apiClient.get(`/pages/${id}`),

    getBreadcrumbs: (id: string) => apiClient.get<DataWrapper<GetPageBreadcrumbsResponse>>(`/pages/${id}/breadcrumbs`),

    create: (data: { name: string; emoji?: string | null; parentId?: string | null; workspaceId?: string }) =>
      apiClient.post('/pages', data),

    createWelcome: (workspaceId?: string) =>
      apiClient.post('/pages/welcome', workspaceId ? { workspaceId } : undefined),

    registerAccess: (id: string) => apiClient.post(`/pages/${id}/access`),

    setFavorite: (id: string, starred: boolean) => apiClient.put(`/pages/${id}/favorite`, { starred }),
    reorder: (id: string, options: { beforeId?: string | null; afterId?: string | null }) =>
      apiClient.post<DataWrapper<ReorderPageResponse>>(`/pages/${id}/reorder`, {
        beforeId: options.beforeId ?? null,
        afterId: options.afterId ?? null,
      } satisfies ReorderPageBody),
    remove: (id: string) => apiClient.delete(`/pages/${id}`),
    restore: (id: string) => apiClient.post<DataWrapper<RestorePageResponse>>(`/pages/${id}/restore`),
    removePermanently: (id: string) => apiClient.delete(`/pages/${id}/permanent`),
    listDeleted: (workspaceId?: string) =>
      apiClient.get<DataWrapper<GetDeletedPagesResponse>>('/pages/deleted', {
        params: workspaceId ? { workspaceId } : undefined,
      }),
    restoreMany: (ids: string[]) =>
      apiClient.post<DataWrapper<BatchRestorePagesResponse>>('/pages/deleted/restore', { ids }),
    removeManyPermanently: (ids: string[]) =>
      apiClient.post<DataWrapper<BatchDeletePagesResponse>>('/pages/deleted/delete', { ids }),

    listApps: (id: string) => apiClient.get<DataWrapper<GetPageAppsResponse>>(`/pages/${id}/apps`),
    connectApp: (id: string, appId: string) =>
      apiClient.post<DataWrapper<ConnectPageAppResponse>>(`/pages/${id}/apps`, { appId }),
    disconnectApp: (id: string, appId: string) => apiClient.delete(`/pages/${id}/apps/${appId}`),

    appendContent: (id: string, content: string) =>
      apiClient.post<DataWrapper<MutatePageContentResponse>>(`/pages/${id}/append`, { content }),
    prependContent: (id: string, content: string) =>
      apiClient.post<DataWrapper<MutatePageContentResponse>>(`/pages/${id}/prepend`, { content }),

    getHistory: (id: string, options?: { cursor?: string; limit?: number; target?: 'content' | 'values' | 'all' }) =>
      apiClient.get<DataWrapper<GetPageHistoryResponse>>(`/pages/${id}/history`, {
        params: {
          ...(options?.cursor && { cursor: options.cursor }),
          ...(options?.limit && { limit: options.limit }),
          ...(options?.target && { target: options.target }),
        },
      }),
    getRevision: (id: string, revisionId: string) =>
      apiClient.get<DataWrapper<GetPageRevisionResponse>>(`/pages/${id}/history/${revisionId}`),
    restoreRevision: (id: string, revisionId: string) =>
      apiClient.post<DataWrapper<RestorePageRevisionResponse>>(`/pages/${id}/history/${revisionId}/restore`),
    forkRevision: (id: string, revisionId: string, body?: ForkPageRevisionBody) =>
      apiClient.post<DataWrapper<ForkPageRevisionResponse>>(`/pages/${id}/history/${revisionId}/fork`, body ?? {}),
  },

  views: {
    remove: (id: string) => apiClient.delete(`/views/${id}`),
    restore: (id: string) => apiClient.post<DataWrapper<RestoreViewResponse>>(`/views/${id}/restore`),
  },

  dataSources: {
    remove: (id: string) => apiClient.delete(`/data-sources/${id}`),
    restore: (id: string) => apiClient.post<DataWrapper<RestoreDataSourceResponse>>(`/data-sources/${id}/restore`),
  },

  // Workspaces API
  workspaces: {
    list: () => apiClient.get<DataWrapper<GetWorkspacesResponse>>('/workspaces'),
    listDeleted: () => apiClient.get<DataWrapper<GetDeletedWorkspacesResponse>>('/workspaces/deleted'),
    create: (data: CreateWorkspaceBody) => apiClient.post<DataWrapper<WorkspaceApi>>('/workspaces', data),
    update: (id: string, data: UpdateWorkspaceBody) =>
      apiClient.patch<DataWrapper<WorkspaceApi>>(`/workspaces/${id}`, data),
    remove: (id: string) => apiClient.delete(`/workspaces/${id}`),
    restore: (id: string) => apiClient.post<DataWrapper<WorkspaceApi>>(`/workspaces/${id}/restore`),
    checkSlugAvailability: (slug: string, excludeWorkspaceId?: string) =>
      apiClient.get<DataWrapper<GetWorkspaceSlugAvailabilityResponse>>('/workspaces/slug-availability', {
        params: { slug, excludeWorkspaceId },
      }),
    getStorageUsage: (id: string) =>
      apiClient.get<DataWrapper<GetWorkspaceStorageUsageResponse>>(`/workspaces/${id}/storage-usage`),
  },

  // Files API (THOTH-040)
  files: {
    // `pageId` associates the upload with a page's `file-usage` immediately; omit it for
    // uploads that happen before a page exists yet (the editor re-syncs usage on every save via
    // `syncFileUsageForPage`, so an unassociated upload becomes an orphan candidate for the
    // `files:purge` job unless a page ends up referencing it).
    upload: (file: File, options?: { pageId?: string; workspaceId?: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.pageId) {
        formData.append('pageId', options.pageId);
      }
      if (options?.workspaceId) {
        formData.append('workspaceId', options.workspaceId);
      }
      // `apiClient.postForm` (rather than `.post`) is required here: the instance's default
      // `Content-Type: application/json` header would otherwise stick around and stop axios /
      // the browser from setting the multipart boundary on this `FormData` body, causing the
      // server to reject it — `postForm` clears/derives the header correctly for `FormData`.
      return apiClient.postForm<DataWrapper<UploadFileResponse>>('/files', formData);
    },
    getDetails: (id: string) => apiClient.get<DataWrapper<GetFileResponse>>(`/files/${id}`),
    remove: (id: string) => apiClient.delete<DataWrapper<DeleteFileResponse>>(`/files/${id}`),
    getContentUrl: (id: string) => `/api/v1/files/${id}/content`,
  },

  // Platform capabilities (THOTH-045) — human cookie session only.
  platform: {
    getCapabilities: () => apiClient.get<DataWrapper<GetPlatformCapabilitiesResponse>>('/platform/capabilities'),
  },

  // Platform administration (THOTH-045). Every endpoint requires a platform-admin cookie session;
  // deliberately not part of the public OpenAPI surface.
  admin: {
    getSettings: () => apiClient.get<DataWrapper<AdminSettingsResponse>>('/admin/settings'),
    updateSettings: (data: UpdateAdminSettingsBody) =>
      apiClient.patch<DataWrapper<AdminSettingsResponse>>('/admin/settings', data),
    listUsers: (parameters?: GetAdminUsersQuery) =>
      apiClient.get<DataWrapper<GetAdminUsersResponse>>('/admin/users', { params: parameters }),
    updateUser: (id: string, data: UpdateAdminUserBody) =>
      apiClient.patch<DataWrapper<UpdateAdminUserResponse>>(`/admin/users/${id}`, data),
    listWorkspaces: (parameters?: GetAdminWorkspacesQuery) =>
      apiClient.get<DataWrapper<GetAdminWorkspacesResponse>>('/admin/workspaces', { params: parameters }),
    updateWorkspace: (id: string, data: UpdateAdminWorkspaceBody) =>
      apiClient.patch<DataWrapper<UpdateAdminWorkspaceResponse>>(`/admin/workspaces/${id}`, data),
  },

  // Apps API
  apps: {
    list: (workspaceId: string) => apiClient.get<DataWrapper<GetAppsResponse>>('/apps', { params: { workspaceId } }),
    getDetails: (id: string) => apiClient.get<DataWrapper<AppDetailResponse>>(`/apps/${id}`),
    create: (data: CreateAppBody) => apiClient.post<DataWrapper<AppResponse>>('/apps', data),
    update: (id: string, data: UpdateAppBody) => apiClient.patch<DataWrapper<AppResponse>>(`/apps/${id}`, data),
    archive: (id: string) => apiClient.delete(`/apps/${id}`),
    createKey: (appId: string, data: CreateApiKeyBody) =>
      apiClient.post<DataWrapper<CreateApiKeyResponse>>(`/apps/${appId}/keys`, data),
    revokeKey: (appId: string, keyId: string) => apiClient.delete(`/apps/${appId}/keys/${keyId}`),
    listWebhooks: (appId: string) => apiClient.get<DataWrapper<GetWebhooksResponse>>(`/apps/${appId}/webhooks`),
    createWebhook: (appId: string, data: CreateWebhookBody) =>
      apiClient.post<DataWrapper<CreateWebhookResponse>>(`/apps/${appId}/webhooks`, data),
    getWebhook: (appId: string, webhookId: string) =>
      apiClient.get<DataWrapper<WebhookResponse>>(`/apps/${appId}/webhooks/${webhookId}`),
    updateWebhook: (appId: string, webhookId: string, data: UpdateWebhookBody) =>
      apiClient.patch<DataWrapper<UpdateWebhookResponse>>(`/apps/${appId}/webhooks/${webhookId}`, data),
    deleteWebhook: (appId: string, webhookId: string) => apiClient.delete(`/apps/${appId}/webhooks/${webhookId}`),
    listWebhookDeliveries: (appId: string, webhookId: string) =>
      apiClient.get<DataWrapper<GetWebhookDeliveriesResponse>>(`/apps/${appId}/webhooks/${webhookId}/deliveries`),
    resendWebhookDelivery: (appId: string, webhookId: string, deliveryId: string) =>
      apiClient.post<DataWrapper<ResendWebhookDeliveryResponse>>(
        `/apps/${appId}/webhooks/${webhookId}/deliveries/${deliveryId}/resend`
      ),
  },
};

export default apiClient;
