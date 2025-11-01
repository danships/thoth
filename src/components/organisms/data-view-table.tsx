'use client';

import { Alert, Button, Group, Loader, Stack, Table } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { DataTableRow } from '@/components/molecules/data-table-row';
import { DataTableColumnHeader } from '@/components/molecules/data-table-column-header';
import { ColumnFormModal } from '@/components/molecules/column-form-modal';
import { NewPageRow } from '@/components/molecules/new-page-row';
import { useDataViewColumns } from '@/lib/hooks/api/use-data-view-columns';
import { usePageValueUpdate } from '@/lib/hooks/api/use-page-value-update';
import { useUpdatePage } from '@/lib/hooks/api/use-update-page';
import type { Column } from '@/types/schemas/entities/container';
import type { GetPagesResponse } from '@/types/api';

type DataViewTableProperties = {
  dataSourceId: string;
  columns: Column[];
  pages: GetPagesResponse | undefined;
  isLoading: boolean;
  error: string | null;
  onPageCreate: (name: string) => Promise<void>;
  onPageNameChange: (value: string) => void;
  newPageName: string;
  createPageInProgress: boolean;
  mutatePages: (
    updateFunction?: (previous: GetPagesResponse | undefined) => GetPagesResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
  mutateDataSource: () => void;
};

export function DataViewTable({
  dataSourceId,
  columns,
  pages,
  isLoading,
  error,
  onPageCreate,
  onPageNameChange,
  newPageName,
  createPageInProgress,
  mutatePages,
  mutateDataSource,
}: DataViewTableProperties) {
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const {
    createColumn,
    updateColumn,
    deleteColumn,
    inProgress: columnOperationInProgress,
  } = useDataViewColumns({
    dataSourceId,
  });

  const { updateValue, inProgress: valueUpdateInProgress } = usePageValueUpdate({ mutatePages });
  const { updatePage, inProgress: pageUpdateInProgress } = useUpdatePage({ mutatePages });

  const handleColumnSubmit = async (values: { name: string; type: 'string' | 'number' | 'boolean' }) => {
    await (editingColumn ? updateColumn(editingColumn.id, values) : createColumn(values.name, values.type));
    mutateDataSource();
  };

  const handleEditColumn = (column: Column) => {
    setEditingColumn(column);
    setShowColumnModal(true);
  };

  const handleDeleteColumn = (column: Column) => {
    modals.openConfirmModal({
      title: 'Delete Column',
      children: `Are you sure you want to delete the column "${column.name}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await deleteColumn(column.id);
        mutateDataSource();
      },
    });
  };

  const handleNewPageKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void onPageCreate(newPageName);
    }
  };

  const handleAddColumn = () => {
    setEditingColumn(null);
    setShowColumnModal(true);
  };

  const handleCloseModal = () => {
    setShowColumnModal(false);
    setEditingColumn(null);
  };

  const inProgress = useMemo(() => {
    return createPageInProgress || columnOperationInProgress || valueUpdateInProgress || pageUpdateInProgress;
  }, [createPageInProgress, columnOperationInProgress, valueUpdateInProgress, pageUpdateInProgress]);

  if (isLoading) {
    return (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error loading pages">
        {error}
      </Alert>
    );
  }

  return (
    <>
      <Group justify="flex-end" mb="md">
        <Button size="xs" variant="default" onClick={handleAddColumn} leftSection={<IconPlus />}>
          Add Column
        </Button>
      </Group>
      <Table striped highlightOnHover w="full" mt="lg">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            {columns.map((col) => (
              <DataTableColumnHeader
                key={col.id}
                column={col}
                onEdit={() => handleEditColumn(col)}
                onDelete={() => handleDeleteColumn(col)}
              />
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pages?.map(({ page, values }) => (
            <DataTableRow
              key={page.id}
              page={page}
              values={values}
              columns={columns}
              onCellUpdate={(columnId, value) => updateValue(page.id, columnId, value)}
              onPageNameUpdate={(pageId, name) => updatePage(pageId, { name })}
              disabled={inProgress}
            />
          ))}
          <NewPageRow
            value={newPageName}
            onChange={onPageNameChange}
            onKeyDown={handleNewPageKeyDown}
            disabled={inProgress}
            columnCount={columns.length}
          />
        </Table.Tbody>
      </Table>
      <ColumnFormModal
        opened={showColumnModal}
        onClose={handleCloseModal}
        onSubmit={handleColumnSubmit}
        {...(editingColumn ? { initialValues: editingColumn } : {})}
        title={editingColumn ? 'Edit Column' : 'Add Column'}
        inProgress={columnOperationInProgress}
      />
    </>
  );
}
