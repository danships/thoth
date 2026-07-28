import useSWR from 'swr';
import { GET_PAGE_APPS_ENDPOINT, type GetPageAppsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function usePageApps(pageId: string | undefined) {
  return useSWR<GetPageAppsResponse>(pageId ? GET_PAGE_APPS_ENDPOINT(pageId) : null, swrFetcher);
}
