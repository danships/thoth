import useSWR from 'swr';
import { GET_DATA_SOURCES_ENDPOINT, type GetDataSourcesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';

// Always pass the current workspace explicitly rather than relying on the API's
// default-workspace fallback, so the list reflects the workspace the caller is actually
// looking at (e.g. the workspace of the page being viewed), not the caller's globally-resolved
// default workspace, which may differ (THOTH-042).
export const useDataSources = () => {
  const { id: workspaceId } = useCurrentWorkspace();
  return useSWR<GetDataSourcesResponse>(
    workspaceId ? `${GET_DATA_SOURCES_ENDPOINT}?workspaceId=${workspaceId}` : null,
    swrFetcher
  );
};
