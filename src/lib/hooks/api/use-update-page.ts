import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { UPDATE_PAGE_ENDPOINT, type GetPagesResponse, type UpdatePageBody } from '@/types/api';

type UseUpdatePageOptions = {
  mutatePages: (
    updateFunction?: (previous: GetPagesResponse | undefined) => GetPagesResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function useUpdatePage({ mutatePages }: UseUpdatePageOptions) {
  const { patch, inProgress } = useCudApi();

  const updatePage = useCallback(
    async (pageId: string, updates: UpdatePageBody) => {
      await patch(UPDATE_PAGE_ENDPOINT.replace(':id', pageId), updates);
      mutatePages(
        (previous) =>
          previous?.map((pageItem) => {
            if (pageItem.page.id !== pageId) {
              return pageItem;
            }
            const updatedPage = { ...pageItem.page };
            if (updates.name !== undefined) {
              updatedPage.name = updates.name.trim();
            }
            if (updates.emoji !== undefined) {
              updatedPage.emoji = updates.emoji;
            }
            return { ...pageItem, page: updatedPage };
          }),
        { revalidate: false }
      );
    },
    [patch, mutatePages]
  );

  return {
    updatePage,
    inProgress,
  };
}
