import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { DELETE_DATA_SOURCE_COLUMN_ENDPOINT } from '@/types/api';

export function useDeleteDataSourceColumn(dataSourceId: string) {
  const { delete: deleteRequest, inProgress } = useCudApi();

  const deleteColumn = useCallback(
    async (columnId: string): Promise<void> => {
      await deleteRequest(
        DELETE_DATA_SOURCE_COLUMN_ENDPOINT.replace(':id', dataSourceId).replace(':columnId', columnId)
      );
    },
    [dataSourceId, deleteRequest]
  );

  return {
    deleteColumn,
    inProgress,
  };
}
