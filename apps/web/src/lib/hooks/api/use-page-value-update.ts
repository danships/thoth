import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { UPDATE_PAGE_VALUES_ENDPOINT, type GetPagesResponse } from '@/types/api';
import type { PageValue } from '@/types/schemas/entities/container';

type UsePageValueUpdateOptions = {
  mutatePages: (
    updateFunction?: (previous: GetPagesResponse | undefined) => GetPagesResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function usePageValueUpdate({ mutatePages }: UsePageValueUpdateOptions) {
  const { patch, inProgress } = useCudApi();

  const updateValue = useCallback(
    async (pageId: string, columnId: string, value: PageValue) => {
      await patch(UPDATE_PAGE_VALUES_ENDPOINT.replace(':id', pageId), { [columnId]: value });
      mutatePages(
        (previous) =>
          previous?.map((pageItem) =>
            pageItem.page.id === pageId ? { ...pageItem, values: { ...pageItem.values, [columnId]: value } } : pageItem
          ),
        { revalidate: false }
      );
    },
    [patch, mutatePages]
  );

  return {
    updateValue,
    inProgress,
  };
}
