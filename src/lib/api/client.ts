import axios from 'axios';
import { notifications } from '@mantine/notifications';
import type { DataWrapper } from '@/types/api';
import type {
  CreateWorkspaceBody,
  GetDeletedWorkspacesResponse,
  GetWorkspacesResponse,
  GetWorkspaceSlugAvailabilityResponse,
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

    create: (data: { name: string; emoji?: string | null; parentId?: string | null; workspaceId?: string }) =>
      apiClient.post('/pages', data),

    createWelcome: (workspaceId?: string) =>
      apiClient.post('/pages/welcome', workspaceId ? { workspaceId } : undefined),

    registerAccess: (id: string) => apiClient.post(`/pages/${id}/access`),

    setFavorite: (id: string, starred: boolean) => apiClient.put(`/pages/${id}/favorite`, { starred }),

    listApps: (id: string) => apiClient.get<DataWrapper<GetPageAppsResponse>>(`/pages/${id}/apps`),
    connectApp: (id: string, appId: string) =>
      apiClient.post<DataWrapper<ConnectPageAppResponse>>(`/pages/${id}/apps`, { appId }),
    disconnectApp: (id: string, appId: string) => apiClient.delete(`/pages/${id}/apps/${appId}`),
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
  },
};

export default apiClient;
