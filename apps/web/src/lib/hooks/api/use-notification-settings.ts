import useSWR from 'swr';
import type { NotificationSettingsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// The caller's quiet-schedule + current mute state (THOTH-071/THOTH-072). `timezone` here is a
// read-only projection of the general user setting (see `useUserSettings`); it can't be written
// through this endpoint.
export function useNotificationSettings() {
  return useSWR<NotificationSettingsResponse>('/notifications/settings', swrFetcher);
}
