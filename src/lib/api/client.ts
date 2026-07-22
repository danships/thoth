import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Pages API
  pages: {
    getTree: (options?: { parentId?: string; cursor?: string; limit?: number }) =>
      apiClient.get('/pages/tree', {
        params: {
          ...(options?.parentId && { parentId: options.parentId }),
          ...(options?.cursor && { cursor: options.cursor }),
          ...(options?.limit && { limit: options.limit }),
        },
      }),

    getDetails: (id: string) => apiClient.get(`/pages/${id}`),

    create: (data: { name: string; emoji?: string | null; parentId?: string | null }) => apiClient.post('/pages', data),

    createWelcome: () => apiClient.post('/pages/welcome'),

    registerAccess: (id: string) => apiClient.post(`/pages/${id}/access`),
  },
};

export default apiClient;
