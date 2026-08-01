import { useCallback } from 'react';
import { mutate as globalMutate } from 'swr';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  RESTORE_PAGE_REVISION_ENDPOINT,
  GET_PAGE_HISTORY_ENDPOINT,
  type RestorePageRevisionResponse,
  type GetPageDetailsResponse,
} from '@/types/api';

type UseRestorePageRevisionOptions = {
  mutatePageDetails?: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function useRestorePageRevision({ mutatePageDetails }: UseRestorePageRevisionOptions = {}) {
  const { post, inProgress } = useCudApi();

  const restoreRevision = useCallback(
    async (pageId: string, revisionId: string) => {
      const result = await post<RestorePageRevisionResponse>(
        RESTORE_PAGE_REVISION_ENDPOINT.replace(':id', pageId).replace(':revisionId', revisionId)
      );

      // Page details/content/values are recomputed server-side by the restore — force a
      // revalidate (rather than an optimistic local patch) so the editor picks up the
      // restored content exactly as persisted.
      mutatePageDetails?.(undefined, { revalidate: true });

      // The history timeline itself needs revalidating too — the restore appended a brand-new
      // revision ("restored to sequence N") that should now appear at the top.
      void globalMutate(
        (key) => typeof key === 'string' && key.startsWith(GET_PAGE_HISTORY_ENDPOINT.replace(':id', pageId))
      );

      return result;
    },
    [post, mutatePageDetails]
  );

  return {
    restoreRevision,
    inProgress,
  };
}
