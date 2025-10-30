import useSWR from 'swr';
import { GET_PAGES_ENDPOINT, type GetPagesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function usePagesByParent(parentId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<GetPagesResponse>(
    parentId ? `${GET_PAGES_ENDPOINT}?parentId=${parentId}` : null,
    swrFetcher
  );

  return {
    data,
    error,
    isLoading,
    mutate,
  };
}

export function usePagesByDataSource(dataSourceId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<GetPagesResponse>(
    dataSourceId ? `${GET_PAGES_ENDPOINT}?dataSourceId=${dataSourceId}` : null,
    swrFetcher
  );

  return {
    data,
    error,
    isLoading,
    mutate,
  };
}
