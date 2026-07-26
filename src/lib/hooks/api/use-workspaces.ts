import useSWR from 'swr';
import { GET_WORKSPACES_ENDPOINT, type GetWorkspacesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function useWorkspaces() {
  return useSWR<GetWorkspacesResponse>(GET_WORKSPACES_ENDPOINT, swrFetcher);
}
