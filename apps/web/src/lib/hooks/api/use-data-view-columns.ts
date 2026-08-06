import { useCreateDataSourceColumn } from './use-create-data-source-column';
import { useUpdateDataSourceColumn } from './use-update-data-source-column';
import { useDeleteDataSourceColumn } from './use-delete-data-source-column';

type UseDataViewColumnsOptions = {
  dataSourceId: string;
};

export function useDataViewColumns({ dataSourceId }: UseDataViewColumnsOptions) {
  const { createColumn, inProgress: createInProgress } = useCreateDataSourceColumn(dataSourceId);
  const { updateColumn, inProgress: updateInProgress } = useUpdateDataSourceColumn(dataSourceId);
  const { deleteColumn, inProgress: deleteInProgress } = useDeleteDataSourceColumn(dataSourceId);

  return {
    createColumn,
    updateColumn,
    deleteColumn,
    inProgress: createInProgress || updateInProgress || deleteInProgress,
  };
}
