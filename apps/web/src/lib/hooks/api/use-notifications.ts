import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';
import type { GetNotificationsResponse, NotificationResponse } from '@/types/api';

export type UseNotificationsOptions = {
  workspaceId?: string;
  unreadOnly?: boolean;
  limit?: number;
};

type ListResult = { notifications: NotificationResponse[]; nextCursor: string | null };

async function fetchNotifications(url: string): Promise<ListResult> {
  const response = await apiClient.get(url);
  const notifications = (response.data.data as GetNotificationsResponse).notifications;
  const pagination = response.data.pagination as { nextCursor: string | null } | undefined;
  return { notifications, nextCursor: pagination?.nextCursor ?? null };
}

function buildKey({ workspaceId, unreadOnly, limit }: UseNotificationsOptions): string {
  const parameters = new URLSearchParams();
  if (workspaceId) {
    parameters.set('workspaceId', workspaceId);
  }
  if (unreadOnly) {
    parameters.set('unreadOnly', 'true');
  }
  parameters.set('limit', String(limit ?? 20));
  return `/notifications?${parameters.toString()}`;
}

// Cursor-paginated inbox list (THOTH-066) with a manual "Load more" button (sufficient for v1,
// mirroring `useDataViewPages`). SWR drives the base page; `accumulated` layers "load more" pages
// and optimistic mark-read/read-all edits on top without a full refetch. Following the codebase's
// "adjust state during render" pattern (not `useEffect`) to reset when the query key changes.
export function useNotifications(options: UseNotificationsOptions = {}) {
  const baseKey = buildKey(options);
  const { data, isLoading, error, mutate } = useSWR(baseKey, fetchNotifications);

  const [accumulated, setAccumulated] = useState<ListResult | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const [previousBaseKey, setPreviousBaseKey] = useState(baseKey);
  // Bumped every time `baseKey` changes, following the same "adjust state during render" pattern
  // as `previousBaseKey` above.
  const [queryGeneration, setQueryGeneration] = useState(0);
  if (baseKey !== previousBaseKey) {
    setPreviousBaseKey(baseKey);
    setQueryGeneration((previous) => previous + 1);
    setAccumulated(undefined);
  }

  // Mirrors `queryGeneration` into a ref that's safe to read from an already-in-flight
  // `loadMore` closure (refs must never be read/written during render itself — only outside it,
  // e.g. in an effect or an event/async callback — so the mirroring happens in an effect, not
  // inline). A filter change that lands mid-request (e.g. `workspaceId`/`unreadOnly` changing)
  // bumps `queryGeneration`, which this effect then reflects into the ref — letting `loadMore`
  // detect on completion that its page belongs to a since-abandoned query and must be discarded,
  // rather than merged into the current one (it can contain rows from another workspace).
  const activeGenerationReference = useRef(queryGeneration);
  useEffect(() => {
    activeGenerationReference.current = queryGeneration;
  }, [queryGeneration]);

  const current = accumulated ?? data;
  const items = current?.notifications ?? [];
  const nextCursor = current?.nextCursor ?? null;

  const setItems = useCallback(
    (updater: (previous: NotificationResponse[]) => NotificationResponse[]) => {
      setAccumulated((previous) => {
        const base = previous ?? data ?? { notifications: [], nextCursor: null };
        return { notifications: updater(base.notifications), nextCursor: base.nextCursor };
      });
    },
    [data]
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    // Capture the generation this request is for so a filter change that lands while the
    // request is in flight (e.g. `workspaceId`/`unreadOnly` changing) can be detected on
    // completion — an in-flight page belonging to a since-abandoned query must never be merged
    // into the current one (it can contain rows from another workspace).
    const requestedGeneration = activeGenerationReference.current;
    try {
      const nextKey = `${baseKey}&cursor=${encodeURIComponent(nextCursor)}`;
      const nextPage = await fetchNotifications(nextKey);
      if (requestedGeneration !== activeGenerationReference.current) {
        return;
      }
      setAccumulated((previous) => {
        const base = previous ?? data ?? { notifications: [], nextCursor: null };
        return {
          notifications: [...base.notifications, ...nextPage.notifications],
          nextCursor: nextPage.nextCursor,
        };
      });
    } finally {
      setLoadingMore(false);
    }
  }, [baseKey, nextCursor, loadingMore, data]);

  const refresh = useCallback(async () => {
    setAccumulated(undefined);
    await mutate();
  }, [mutate]);

  return {
    items,
    setItems,
    isLoading: isLoading && !accumulated,
    loadingMore,
    error: error ? 'Failed to load notifications' : null,
    hasMore: nextCursor !== null,
    refresh,
    loadMore,
  };
}
