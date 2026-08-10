import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  UPDATE_DATA_SOURCE_COLUMN_ENDPOINT,
  type UpdateDataSourceColumnBody,
  type UpdateDataSourceColumnResponse,
} from '@/types/api';

export function useUpdateDataSourceColumn(dataSourceId: string) {
  const { patch, inProgress } = useCudApi();

  const updateColumn = useCallback(
    async (columnId: string, updates: UpdateDataSourceColumnBody): Promise<UpdateDataSourceColumnResponse | null> => {
      return await patch<UpdateDataSourceColumnResponse, UpdateDataSourceColumnBody>(
        UPDATE_DATA_SOURCE_COLUMN_ENDPOINT.replace(':id', dataSourceId).replace(':columnId', columnId),
        updates
      );
    },
    [dataSourceId, patch]
  );

  return {
    updateColumn,
    inProgress,
  };
}
