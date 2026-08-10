import useSWR from 'swr';
import { GET_PAGE_HISTORY_ENDPOINT, type GetPageHistoryResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

type UsePageHistoryOptions = {
  cursor?: string;
  limit?: number;
  target?: 'content' | 'values' | 'all';
};

export const usePageHistory = (pageId: string | null, options?: UsePageHistoryOptions) => {
  const searchParameters = new URLSearchParams();
  if (options?.cursor) {
    searchParameters.set('cursor', options.cursor);
  }
  if (options?.limit) {
    searchParameters.set('limit', String(options.limit));
  }
  if (options?.target) {
    searchParameters.set('target', options.target);
  }
  const query = searchParameters.toString();

  return useSWR<GetPageHistoryResponse>(
    pageId ? `${GET_PAGE_HISTORY_ENDPOINT.replace(':id', pageId)}${query ? `?${query}` : ''}` : null,
    swrFetcher
  );
};
