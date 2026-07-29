import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { SET_PAGE_CONTENT, type GetPageDetailsResponse, type SetPageContentBody } from '@/types/api';

type UseSetPageContentOptions = {
  mutatePageDetails: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function useSetPageContent({ mutatePageDetails }: UseSetPageContentOptions) {
  const { post, inProgress } = useCudApi();

  const setPageContent = useCallback(
    async (pageId: string, content: string) => {
      await post<unknown, SetPageContentBody>(SET_PAGE_CONTENT.replace(':id', pageId), { content });
      mutatePageDetails(
        (previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            content,
          };
        },
        { revalidate: false }
      );
    },
    [post, mutatePageDetails]
  );

  return {
    setPageContent,
    inProgress,
  };
}
