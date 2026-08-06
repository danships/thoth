import useSWR from 'swr';
import { GET_PLATFORM_CAPABILITIES_ENDPOINT, type GetPlatformCapabilitiesResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';

/**
 * Fetches the current user's platform capabilities (THOTH-045): whether they're a platform admin
 * and whether they may create additional workspaces. Used to conditionally render platform-level
 * UI (the admin link, the "New workspace" affordance).
 */
export function usePlatformCapabilities() {
  return useSWR<GetPlatformCapabilitiesResponse>(GET_PLATFORM_CAPABILITIES_ENDPOINT, swrFetcher);
}
