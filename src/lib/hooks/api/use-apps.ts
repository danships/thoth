import useSWR from 'swr';
import { GET_APPS_ENDPOINT, type GetAppsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function useApps(workspaceId: string | undefined) {
  return useSWR<GetAppsResponse>(workspaceId ? `${GET_APPS_ENDPOINT}?workspaceId=${workspaceId}` : null, swrFetcher);
}
