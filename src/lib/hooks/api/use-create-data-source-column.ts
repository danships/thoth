import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  CREATE_DATA_SOURCE_COLUMN_ENDPOINT,
  type CreateDataSourceColumnBody,
  type CreateDataSourceColumnResponse,
} from '@/types/api';

export function useCreateDataSourceColumn(dataSourceId: string) {
  const { post, inProgress } = useCudApi();

  const createColumn = useCallback(
    async (name: string, type: 'string' | 'number' | 'boolean'): Promise<CreateDataSourceColumnResponse | null> => {
      return await post<CreateDataSourceColumnResponse, CreateDataSourceColumnBody>(
        CREATE_DATA_SOURCE_COLUMN_ENDPOINT.replace(':id', dataSourceId),
        {
          name: name.trim(),
          type,
        }
      );
    },
    [dataSourceId, post]
  );

  return {
    createColumn,
    inProgress,
  };
}
