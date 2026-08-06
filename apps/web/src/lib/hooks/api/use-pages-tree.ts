import useSWRInfinite from 'swr/infinite';
import { GET_PAGES_TREE_ENDPOINT, PAGES_TREE_DEFAULT_LIMIT, type GetPagesTreeResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';

// Cursor-based key derivation: each page's key is derived from the *previous* page's response
// (its `pagination.nextCursor`), not from a numeric offset/page-index — required since the
// root list is ordered by `ContainerAccess.lastAccessedAt`, which can shift between requests.
function getKey(workspaceId: string, pageIndex: number, previousPageData: GetPagesTreeResponse | null) {
  // Reached the end.
  if (previousPageData && !previousPageData.pagination.hasMore) {
    return null;
  }

  if (pageIndex === 0 || !previousPageData) {
    return `${GET_PAGES_TREE_ENDPOINT}?limit=${PAGES_TREE_DEFAULT_LIMIT}&workspaceId=${workspaceId}`;
  }

  const cursor = previousPageData.pagination.nextCursor;
  if (!cursor) {
    return null;
  }

  return `${GET_PAGES_TREE_ENDPOINT}?limit=${PAGES_TREE_DEFAULT_LIMIT}&workspaceId=${workspaceId}&cursor=${encodeURIComponent(cursor)}`;
}

export function usePagesTree() {
  // Scoping the root list to the current workspace (rather than relying on the server's
  // "caller's first workspace" fallback) is what makes switching workspaces via the sidebar
  // actually show a different page list — the SWR key changing on workspace switch also
  // ensures the tree refetches instead of showing stale, cached data from the previous one.
  const { id: workspaceId } = useCurrentWorkspace();
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<GetPagesTreeResponse>(
    (pageIndex, previousPageData) => getKey(workspaceId, pageIndex, previousPageData),
    swrFetcher
  );

  const pages = data ?? [];
  const branches = pages.flatMap((page) => page.branches);
  const lastPage = pages.at(-1);
  const hasMore = lastPage ? lastPage.pagination.hasMore : false;

  // isLoadingMore is true while a *subsequent* page is being fetched (not the very first load).
  // Excludes the case where the fetch errored out — otherwise a failed load-more request would
  // leave data[size - 1] undefined indefinitely, keeping the loader stuck and hiding the retry UI.
  const isLoadingMore = !error && size > 0 && !!data && data[size - 1] === undefined;

  const loadMore = () => {
    if (!hasMore || isLoadingMore || isValidating) {
      return;
    }
    void setSize(size + 1);
  };

  return {
    data: pages.length > 0 ? { branches } : undefined,
    branches,
    error,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    mutate,
  };
}
