import useSWRInfinite from 'swr/infinite';
import { GET_PAGES_TREE_ENDPOINT, PAGES_TREE_DEFAULT_LIMIT, type GetPagesTreeResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// Cursor-based key derivation: each page's key is derived from the *previous* page's response
// (its `pagination.nextCursor`), not from a numeric offset/page-index — required since the
// root list is ordered by `ContainerAccess.lastAccessedAt`, which can shift between requests.
function getKey(pageIndex: number, previousPageData: GetPagesTreeResponse | null) {
  // Reached the end.
  if (previousPageData && !previousPageData.pagination.hasMore) {
    return null;
  }

  if (pageIndex === 0 || !previousPageData) {
    return `${GET_PAGES_TREE_ENDPOINT}?limit=${PAGES_TREE_DEFAULT_LIMIT}`;
  }

  const cursor = previousPageData.pagination.nextCursor;
  if (!cursor) {
    return null;
  }

  return `${GET_PAGES_TREE_ENDPOINT}?limit=${PAGES_TREE_DEFAULT_LIMIT}&cursor=${encodeURIComponent(cursor)}`;
}

export function usePagesTree() {
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<GetPagesTreeResponse>(
    getKey,
    swrFetcher
  );

  const pages = data ?? [];
  const branches = pages.flatMap((page) => page.branches);
  const lastPage = pages.at(-1);
  const hasMore = lastPage ? lastPage.pagination.hasMore : false;

  // isLoadingMore is true while a *subsequent* page is being fetched (not the very first load).
  const isLoadingMore = size > 0 && !!data && data[size - 1] === undefined;

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
