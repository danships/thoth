import useSWR from 'swr';
import type { AppDetailResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function useApp(id: string | undefined) {
  return useSWR<AppDetailResponse>(id ? `/apps/${id}` : null, swrFetcher);
}
