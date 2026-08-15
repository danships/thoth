import useSWR from 'swr';
import type { GetUserSettingsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

// The general, cross-workspace user-settings projection (THOTH-071/THOTH-072): currently just
// the IANA `timezone` the quiet-schedule evaluator reads. Not scoped to any workspace.
export function useUserSettings() {
  return useSWR<GetUserSettingsResponse>('/user/settings', swrFetcher);
}
