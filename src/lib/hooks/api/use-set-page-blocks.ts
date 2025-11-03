import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { SET_PAGE_BLOCKS, type GetPageDetailsResponse, type SetPageBlocksBody } from '@/types/api';
import { Block } from '@blocknote/core';

type UseSetPageBlocksOptions = {
  mutatePageDetails: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function useSetPageBlocks({ mutatePageDetails }: UseSetPageBlocksOptions) {
  const { post, inProgress } = useCudApi();

  const setPageBlocks = useCallback(
    async (pageId: string, blocks: Block[]) => {
      await post<unknown, SetPageBlocksBody>(SET_PAGE_BLOCKS.replace(':pageId', pageId), { blocks });
      mutatePageDetails(
        (previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            blocks,
          };
        },
        { revalidate: false }
      );
    },
    [post, mutatePageDetails]
  );

  return {
    setPageBlocks,
    inProgress,
  };
}
