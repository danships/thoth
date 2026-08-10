import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { FORK_PAGE_REVISION_ENDPOINT, type ForkPageRevisionBody, type ForkPageRevisionResponse } from '@/types/api';

export function useForkPageRevision() {
  const { post, inProgress } = useCudApi();

  const forkRevision = useCallback(
    async (pageId: string, revisionId: string, body?: ForkPageRevisionBody) => {
      // The route always expects a JSON object body (even when empty) — sending `undefined`
      // (axios omits the request body entirely) fails `expectedBodySchema` validation server-side.
      return post<ForkPageRevisionResponse, ForkPageRevisionBody>(
        FORK_PAGE_REVISION_ENDPOINT.replace(':id', pageId).replace(':revisionId', revisionId),
        body ?? {}
      );
    },
    [post]
  );

  return {
    forkRevision,
    inProgress,
  };
}
