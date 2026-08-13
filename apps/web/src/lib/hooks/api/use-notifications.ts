import { useCallback, useState } from 'react';
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
  if (baseKey !== previousBaseKey) {
    setPreviousBaseKey(baseKey);
    setAccumulated(undefined);
  }

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
    try {
      const nextKey = `${baseKey}&cursor=${encodeURIComponent(nextCursor)}`;
      const nextPage = await fetchNotifications(nextKey);
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
