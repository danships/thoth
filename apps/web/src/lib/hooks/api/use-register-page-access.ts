import { useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { POST_PAGE_ACCESS_ENDPOINT } from '@/types/api';

/**
 * Explicitly registers a "page opened" event for the given page id. Best-effort only: network
 * failures are swallowed so this can never block page rendering or surface an error to the
 * user — it's a UX ordering signal, not a critical operation.
 */
export function useRegisterPageAccess() {
  const registerAccess = useCallback(async (pageId: string) => {
    try {
      await apiClient.post(POST_PAGE_ACCESS_ENDPOINT.replace(':id', pageId));
    } catch {
      // Swallowed intentionally — see function doc above.
    }
  }, []);

  return { registerAccess };
}
