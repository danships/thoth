import { apiClient } from '@/lib/api/client';
import { nanoquery } from '@nanostores/query';

export const [createFetcherStore, createMutatorStore] = nanoquery({
  fetcher: (...keys) => apiClient.get(keys.join('')).then((r) => r.data.data),
});
