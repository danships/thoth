import axios from 'axios';
import type { DataWrapper } from '@/types/api';
import type {
  CreateWorkspaceBody,
  GetWorkspacesResponse,
  GetWorkspaceSlugAvailabilityResponse,
  UpdateWorkspaceBody,
  WorkspaceApi,
} from '@/types/api';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  },

  // Workspaces API
  workspaces: {
    list: () => apiClient.get<DataWrapper<GetWorkspacesResponse>>('/workspaces'),
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
};

export default apiClient;
