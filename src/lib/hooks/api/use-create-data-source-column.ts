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
    async (body: CreateDataSourceColumnBody): Promise<CreateDataSourceColumnResponse | null> => {
      return await post<CreateDataSourceColumnResponse, CreateDataSourceColumnBody>(
        CREATE_DATA_SOURCE_COLUMN_ENDPOINT.replace(':id', dataSourceId),
        body
      );
    },
    [dataSourceId, post]
  );

  return {
    createColumn,
    inProgress,
  };
}
