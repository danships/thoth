import { useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { usePagesByDataSource } from './use-pages';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
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
 *
 * `enabled` gates the underlying SWR request with a `null` key when the legacy `dataSourceId`
 * path is active instead (mirrors `usePagesByDataSource`'s own `null`-key gating below), so a
 * view without filters/sorts never fires this redundant `GET /pages?viewId=...` request
 * alongside the legacy one.
 */
function useViewQueryPages(view: Pick<DataView, 'id' | 'lastUpdated'>, enabled: boolean) {
  const { mutate: mutateGlobal } = useSWRConfig();
  const { showError } = useNotification();

  // `lastUpdated` is included so the SWR key changes whenever the view's persisted
  // `filters`/`sorts` change (via `PATCH /views/:id`), forcing a refetch — the raw-SQL
  // `viewId` path reads filters/sorts from the persisted `DataView` server-side, so there's no
  // other query param that would otherwise signal "the effective query changed".
  const baseKey = `${GET_PAGES_ENDPOINT}?viewId=${view.id}&includeValues=true&v=${encodeURIComponent(view.lastUpdated)}`;
  const [cursorKey, setCursorKey] = useState(baseKey);
  const { data, isLoading, error, mutate } = useSWR<GetPagesResponse>(
    enabled ? cursorKey : null,
    swrFetcherWithPageQueryPagination
  );
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

  // `accumulated` is the rendering source of truth once it's been set — either by "load more"
  // appending a page, or by an optimistic patch (`resetAndMutate` below) — and falls back to the
  // freshly-fetched `data` for the base cursor otherwise. Previously this only consulted
  // `accumulated` once `cursorKey !== baseKey`, so an optimistic edit applied while still on the
  // first page was computed but never rendered (see THOTH-037 review).
  const pages = accumulated ?? data;

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
      // Prime the SWR cache for `nextKey` with the page we just fetched (`revalidate: false`)
      // before switching the hook's key to it, so the subsequent `useSWR(nextKey, ...)` render
      // reuses this cached page instead of firing a second, redundant request for it.
      await mutateGlobal(nextKey, nextPage, { revalidate: false });
      setCursorKey(nextKey);
    } catch (loadMoreError) {
      showError(loadMoreError instanceof Error ? loadMoreError.message : 'Failed to load more pages');
    } finally {
      setLoadingMore(false);
    }
  }, [baseKey, pagination, pages, loadingMore, mutateGlobal, showError]);

  const resetAndMutate = useCallback(
    async (
      updateFunction?: (previous: GetPagesResponse | undefined) => GetPagesResponse | undefined,
      options?: { revalidate: boolean }
    ): Promise<GetPagesResponse | undefined> => {
      if (updateFunction) {
        // Optimistic patch (e.g. a single cell/row edit): apply it against the currently
        // rendered — possibly multi-page-accumulated — list, keeping the current cursor
        // position intact. Resetting to `baseKey` here would collapse any "load more" progress
        // back to the first page on every optimistic edit. The SWR cache entry for `cursorKey`
        // is intentionally left untouched (it only ever holds a single cursor page, not the
        // full accumulated list) — `options.revalidate` still triggers a real refetch when
        // asked for one.
        const optimistic = updateFunction(pages);
        setAccumulated(optimistic);
        if (options?.revalidate) {
          return mutate();
        }
        return optimistic;
      }
      // Full refresh (e.g. new filters/sorts were just applied): reset back to the first page.
      // Returns the freshly-fetched data directly (rather than `void`) so a caller that needs it
      // synchronously (e.g. reordering against the just-revalidated manual order right after
      // clearing a custom sort — THOTH-036) doesn't have to wait for this hook's own state to
      // re-render, which wouldn't happen within the same synchronous continuation anyway.
      setCursorKey(baseKey);
      setAccumulated(undefined);
      return mutate(undefined, options);
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
  const queryPages = useViewQueryPages(view, usesQueryPath);

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
