import useSWR from 'swr';
import { GET_DELETED_PAGES_ENDPOINT, type GetDeletedPagesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';

export function useDeletedPages() {
  const { id: workspaceId } = useCurrentWorkspace();

  return useSWR<GetDeletedPagesResponse>(`${GET_DELETED_PAGES_ENDPOINT}?workspaceId=${workspaceId}`, swrFetcher);
}
