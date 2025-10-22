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
    getTree: (parentId?: string) =>
      apiClient.get('/pages/tree', {
        params: parentId ? { parentId } : {},
      }),

    getDetails: (id: string) => apiClient.get(`/pages/${id}`),

    create: (data: { name: string; emoji?: string | null; parentId?: string | null }) => apiClient.post('/pages', data),
  },
};

export default apiClient;
