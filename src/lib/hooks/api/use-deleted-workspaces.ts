import useSWR from 'swr';
import { GET_DELETED_WORKSPACES_ENDPOINT, type GetDeletedWorkspacesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// Powers the `/workspaces` "Recently deleted" list — soft-deleted workspaces the user can still
// restore before the grace period elapses.
export function useDeletedWorkspaces() {
  return useSWR<GetDeletedWorkspacesResponse>(GET_DELETED_WORKSPACES_ENDPOINT, swrFetcher);
}
