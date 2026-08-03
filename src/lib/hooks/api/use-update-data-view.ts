import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { UPDATE_DATA_VIEW_ENDPOINT, type UpdateDataViewBody, type UpdateDataViewResponse } from '@/types/api';

export function useUpdateDataView(viewId: string) {
  const { patch, inProgress, error } = useCudApi();

  const updateDataView = useCallback(
    async (body: UpdateDataViewBody): Promise<UpdateDataViewResponse | null> => {
      return await patch<UpdateDataViewResponse, UpdateDataViewBody>(
        UPDATE_DATA_VIEW_ENDPOINT.replace(':id', viewId),
        body
      );
    },
    [viewId, patch]
  );

  return {
    updateDataView,
    inProgress,
    error,
  };
}
