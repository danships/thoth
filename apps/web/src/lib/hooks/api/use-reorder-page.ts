import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { REORDER_PAGE_ENDPOINT, type ReorderPageBody, type ReorderPageResponse } from '@/types/api';

/**
 * Thin wrapper around `POST /pages/:id/reorder` (THOTH-036). Callers are responsible for their
 * own optimistic UI update + rollback (the shape of the "pages" collection differs across the
 * three surfaces this is used from — data-view table rows, sidebar tree child pages, sub-pages
 * list — so there's no single generic cache shape to mutate here).
 */
export function useReorderPage() {
  const { post, inProgress, error } = useCudApi();

  const reorderPage = useCallback(
    async (
      pageId: string,
      anchors: { beforeId?: string | null; afterId?: string | null }
    ): Promise<ReorderPageResponse> => {
      return post<ReorderPageResponse, ReorderPageBody>(REORDER_PAGE_ENDPOINT.replace(':id', pageId), {
        beforeId: anchors.beforeId ?? null,
        afterId: anchors.afterId ?? null,
      });
    },
    [post]
  );

  return { reorderPage, inProgress, error };
}
