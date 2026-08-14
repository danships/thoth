import useSWR from 'swr';
import type { GetNotificationSubscriptionsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// Canonical subscription/exclusion rules for the current user (THOTH-066), optionally scoped to
// one workspace. Keyed by the query URL so a per-workspace and a global view cache separately.
export function useNotificationSubscriptions(workspaceId?: string) {
  const key = workspaceId
    ? `/notifications/subscriptions?workspaceId=${encodeURIComponent(workspaceId)}`
    : '/notifications/subscriptions';
  return useSWR<GetNotificationSubscriptionsResponse>(key, swrFetcher);
}
