import { useCallback } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import {
  CREATE_SINGLE_SELECT_OPTION_ENDPOINT,
  type CreateSingleSelectOptionBody,
  type CreateSingleSelectOptionResponse,
} from '@/types/api';

export function useCreateSingleSelectOption(dataSourceId: string) {
  const { post, inProgress } = useCudApi();

  const createOption = useCallback(
    async (columnId: string, body: CreateSingleSelectOptionBody): Promise<CreateSingleSelectOptionResponse | null> => {
      return await post<CreateSingleSelectOptionResponse, CreateSingleSelectOptionBody>(
        CREATE_SINGLE_SELECT_OPTION_ENDPOINT.replace(':id', dataSourceId).replace(':columnId', columnId),
        body
      );
    },
    [dataSourceId, post]
  );

  return {
    createOption,
    inProgress,
  };
}
