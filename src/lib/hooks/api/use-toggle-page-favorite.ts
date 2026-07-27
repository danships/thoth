import { useCallback } from 'react';
import { mutate as globalMutate } from 'swr';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  GET_PAGES_ENDPOINT,
  GET_PAGES_TREE_ENDPOINT,
  PUT_PAGE_FAVORITE_ENDPOINT,
  type GetPageDetailsResponse,
  type PutPageFavoriteResponse,
} from '@/types/api';

type UseToggleFavoriteOptions = {
  mutatePageDetails?: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function useToggleFavorite({ mutatePageDetails }: UseToggleFavoriteOptions = {}) {
  const { put, inProgress } = useCudApi();

  const toggleFavorite = useCallback(
    async (pageId: string, starred: boolean) => {
      const result = await put<PutPageFavoriteResponse>(PUT_PAGE_FAVORITE_ENDPOINT.replace(':id', pageId), {
        starred,
      });

      if (mutatePageDetails) {
        mutatePageDetails((previous) => (previous ? { ...previous, starred: result.starred } : previous), {
          revalidate: false,
        });
      }

      // Revalidate the independent `usePagesByFavorited()` cache so the sidebar's Favorites
      // section updates immediately. Matched by key prefix since the cache key is now
      // workspace-scoped (`?favorited=true&workspaceId=...`).
      void globalMutate(
        (key) => typeof key === 'string' && key.startsWith(`${GET_PAGES_ENDPOINT}?favorited=true`)
      );

      // Starring also bumps `lastAccessedAt`, so the root pages-tree cache (keyed per-page by
      // `useSWRInfinite`) needs to be told to refresh too — matched by key prefix since it's
      // paginated across multiple cache keys.
      void globalMutate((key) => typeof key === 'string' && key.startsWith(GET_PAGES_TREE_ENDPOINT));

      return result;
    },
    [put, mutatePageDetails]
  );

  return {
    toggleFavorite,
    inProgress,
  };
}
