import useSWR from 'swr';
import type { GetWorkspaceStorageUsageResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

export function useStorageUsage(workspaceId: string) {
  return useSWR<GetWorkspaceStorageUsageResponse>(`/workspaces/${workspaceId}/storage-usage`, swrFetcher);
}
