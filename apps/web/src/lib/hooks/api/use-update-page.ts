import { useCallback } from 'react';
import { mutate as globalMutate } from 'swr';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  GET_PAGES_ENDPOINT,
  UPDATE_PAGE_ENDPOINT,
  type GetPagesResponse,
  type GetPageDetailsResponse,
  type UpdatePageBody,
} from '@/types/api';

type UseUpdatePageOptions = {
  mutatePages?: (
    updateFunction?: (previous: GetPagesResponse | undefined) => GetPagesResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
  mutatePageDetails?: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function useUpdatePage({ mutatePages, mutatePageDetails }: UseUpdatePageOptions = {}) {
  const { patch, inProgress } = useCudApi();

  const updatePage = useCallback(
    async (pageId: string, updates: UpdatePageBody) => {
      await patch(UPDATE_PAGE_ENDPOINT.replace(':id', pageId), updates);

      if (mutatePages) {
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
              if (updates.cover !== undefined) {
                updatedPage.cover = updates.cover;
              }
              if (updates.isPrivate !== undefined) {
                updatedPage.isPrivate = updates.isPrivate;
              }
              return { ...pageItem, page: updatedPage };
            }),
          { revalidate: false }
        );
      }

      if (mutatePageDetails) {
        mutatePageDetails(
          (previous) => {
            if (!previous) return previous;
            return {
              ...previous,
              page: {
                ...previous.page,
                ...(updates.name !== undefined && { name: updates.name.trim() }),
                ...(updates.emoji !== undefined && { emoji: updates.emoji }),
                ...(updates.cover !== undefined && { cover: updates.cover }),
                ...(updates.isPrivate !== undefined && { isPrivate: updates.isPrivate }),
              },
            };
          },
          { revalidate: false }
        );
      }

      // Marking/un-marking a page private doesn't affect name/emoji/cover, but does affect
      // whether it shows up in the sidebar's Recent list — the existing `mutatePages`/
      // `mutatePageDetails` callbacks above never touch that independent cache, so revalidate
      // it explicitly here, matched by key prefix (workspace-scoped, like
      // `useToggleFavorite`'s equivalent revalidation of Favorites).
      if (updates.isPrivate !== undefined) {
        void globalMutate((key) => typeof key === 'string' && key.startsWith(`${GET_PAGES_ENDPOINT}?recent=true`));
      }
    },
    [patch, mutatePages, mutatePageDetails]
  );

  return {
    updatePage,
    inProgress,
  };
}
