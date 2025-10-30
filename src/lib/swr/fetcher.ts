import { apiClient } from '@/lib/api/client';

export const swrFetcher = (url: string) => apiClient.get(url).then((r) => r.data.data);
