import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { GET_PAGES_ENDPOINT, UPDATE_PAGE_VALUES_ENDPOINT, type GetPageDetailsResponse } from '@/types/api';
import type { PageValue } from '@/types/schemas/entities/container';

type UsePageDetailValueUpdateOptions = {
  mutatePageDetails: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

export function usePageDetailValueUpdate({ mutatePageDetails }: UsePageDetailValueUpdateOptions) {
  const { patch, inProgress } = useCudApi();
  const { mutate: globalMutate } = useSWRConfig();

  const updateValue = useCallback(
    async (pageId: string, columnId: string, value: PageValue, dataSourceId?: string | null) => {
      await patch(UPDATE_PAGE_VALUES_ENDPOINT.replace(':id', pageId), { [columnId]: value });

      // Revalidate the page-details cache entry itself, rather than just patching it locally,
      // so the Fields tab always reflects the server's authoritative state after a save.
      await mutatePageDetails(
        (previous) => (previous ? { ...previous, values: { ...previous.values, [columnId]: value } } : previous),
        { revalidate: true }
      );

      if (dataSourceId) {
        // A DataViewTable open elsewhere for the same data source uses this exact key
        // (see usePagesByDataSource), so revalidate it too for cross-view consistency.
        await globalMutate(`${GET_PAGES_ENDPOINT}?dataSourceId=${dataSourceId}&includeValues=true`);
      }
    },
    [patch, mutatePageDetails, globalMutate]
  );

  return {
    updateValue,
    inProgress,
  };
}
