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
    async (
      name: string,
      type: 'string' | 'number' | 'boolean' | 'date',
      options?: {
        dateFormat?: string;
        includeTime?: boolean;
      }
    ): Promise<CreateDataSourceColumnResponse | null> => {
      const body: CreateDataSourceColumnBody = {
        name: name.trim(),
        type,
        ...(options ? { options } : {}),
      };
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
