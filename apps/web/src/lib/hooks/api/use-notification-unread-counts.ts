import useSWR from 'swr';
import type { GetNotificationUnreadCountsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// Header-bell unread counts (THOTH-066). Polled so a notification produced by the async
// `notification.dispatch` job appears without a manual refresh.
export function useNotificationUnreadCounts() {
  return useSWR<GetNotificationUnreadCountsResponse>('/notifications/unread-counts', swrFetcher, {
    refreshInterval: 30_000,
  });
}
