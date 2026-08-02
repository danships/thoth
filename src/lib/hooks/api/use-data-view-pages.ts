import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { usePagesByDataSource } from './use-pages';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  CREATE_PAGE_ENDPOINT,
  GET_PAGES_ENDPOINT,
  type CreatePageBody,
  type CreatePageResponse,
  type DataView,
  type GetPagesResponse,
} from '@/types/api';
import { getPageQueryPagination, swrFetcherWithPageQueryPagination } from '@/lib/swr/fetcher';

function hasFilterSortConfig(view: Pick<DataView, 'filters' | 'sorts'>): boolean {
  return (view.filters?.length ?? 0) > 0 || (view.sorts?.length ?? 0) > 0;
}

/**
 * Cursor-paginated variant used once a view has a non-empty `filters`/`sorts` config (THOTH-037)
 * — delegates to the raw-SQL `viewId` path on `GET /pages` instead of the legacy in-memory
 * `dataSourceId` path. A manual "Load more" button (rather than infinite scroll) is sufficient
 * for v1 (see THOTH-037's Implementation Steps).
 */
function useViewQueryPages(view: Pick<DataView, 'id' | 'lastUpdated'>) {
  // `lastUpdated` is included so the SWR key changes whenever the view's persisted
  // `filters`/`sorts` change (via `PATCH /views/:id`), forcing a refetch — the raw-SQL
  // `viewId` path reads filters/sorts from the persisted `DataView` server-side, so there's no
  // other query param that would otherwise signal "the effective query changed".
  const baseKey = `${GET_PAGES_ENDPOINT}?viewId=${view.id}&includeValues=true&v=${encodeURIComponent(view.lastUpdated)}`;
  const [cursorKey, setCursorKey] = useState(baseKey);
  const { data, isLoading, error, mutate } = useSWR<GetPagesResponse>(cursorKey, swrFetcherWithPageQueryPagination);
  const [accumulated, setAccumulated] = useState<GetPagesResponse | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  // `cursorKey` is separate state from `baseKey` so "load more" can append pages onto the same
  // base query without the SWR key (and therefore the loading/error state consumers see)
  // resetting mid-scroll. But that means `cursorKey` doesn't automatically track `baseKey`
  // changes — when the view's persisted `filters`/`sorts` change (bumping `view.lastUpdated`,
  // which is baked into `baseKey`), reset back to the first page. This follows React's
  // recommended "adjusting state when a prop changes" pattern (setState during render, not in
  // an effect) rather than `useEffect`, to avoid the extra cascading-render commit.
  const [previousBaseKey, setPreviousBaseKey] = useState(baseKey);
  if (baseKey !== previousBaseKey) {
    setPreviousBaseKey(baseKey);
    setCursorKey(baseKey);
    setAccumulated(undefined);
  }

  // Reset accumulation whenever the base query changes (a new filter/sort is applied) or the
  // first page reloads — but keep appending across "load more" clicks (cursorKey !== baseKey).
  const pages = useMemo(() => {
    if (cursorKey === baseKey) {
      return data;
    }
    return accumulated;
  }, [cursorKey, baseKey, data, accumulated]);

  const pagination = getPageQueryPagination(data);

  const loadMore = useCallback(async () => {
    if (!pagination?.hasMore || !pagination.nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const nextKey = `${baseKey}&cursor=${encodeURIComponent(pagination.nextCursor)}`;
      const nextPage = await swrFetcherWithPageQueryPagination(nextKey);
      setAccumulated([...(pages ?? []), ...nextPage]);
      setCursorKey(nextKey);
    } finally {
      setLoadingMore(false);
    }
  }, [baseKey, pagination, pages, loadingMore]);

  const resetAndMutate = useCallback(
    (
      updateFunction?: (previous: GetPagesResponse | undefined) => GetPagesResponse | undefined,
      options?: { revalidate: boolean }
    ) => {
      if (updateFunction) {
        setAccumulated(updateFunction(pages));
      }
      setCursorKey(baseKey);
      void mutate(updateFunction ? updateFunction(pages) : undefined, options);
    },
    [baseKey, mutate, pages]
  );

  return {
    pages,
    isLoading,
    error,
    mutate: resetAndMutate,
    hasMore: pagination?.hasMore ?? false,
    loadMore,
    loadingMore,
  };
}

export function useDataViewPages(view: DataView) {
  const usesQueryPath = hasFilterSortConfig(view);

  const legacy = usePagesByDataSource(usesQueryPath ? null : view.dataSourceId, { includeValues: true });
  const queryPages = useViewQueryPages(view);

  const { post, inProgress } = useCudApi();

  const active = useMemo(
    () =>
      usesQueryPath
        ? {
            pages: queryPages.pages,
            isLoading: queryPages.isLoading,
            error: queryPages.error,
            mutate: queryPages.mutate,
          }
        : { pages: legacy.data, isLoading: legacy.isLoading, error: legacy.error, mutate: legacy.mutate },
    [usesQueryPath, queryPages, legacy]
  );

  const createPage = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName || inProgress) {
        return;
      }
      await post<CreatePageResponse, CreatePageBody>(CREATE_PAGE_ENDPOINT, {
        name: trimmedName,
        emoji: null,
        parentId: view.dataSourceId,
      });
      active.mutate();
    },
    [view.dataSourceId, inProgress, post, active]
  );

  return {
    pages: active.pages,
    isLoading: active.isLoading,
    error: active.error,
    createPage,
    inProgress,
    mutate: active.mutate,
    // Only meaningful when `usesQueryPath` — the legacy path is unpaginated.
    hasMore: usesQueryPath ? queryPages.hasMore : false,
    loadMore: queryPages.loadMore,
    loadingMore: queryPages.loadingMore,
  };
}
