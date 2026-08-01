'use client';

/* eslint-disable unicorn/no-nested-ternary */
import { Alert, Button, Group, Loader, Stack, Table } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { DataTableRow } from '@/components/molecules/data-table-row';
import { DataTableColumnHeader } from '@/components/molecules/data-table-column-header';
import { ColumnFormModal } from '@/components/molecules/column-form-modal';
import { NewPageRow } from '@/components/molecules/new-page-row';
import { useNotification } from '@/lib/hooks/use-notification';
import { useDataViewColumns } from '@/lib/hooks/api/use-data-view-columns';
import { usePageValueUpdate } from '@/lib/hooks/api/use-page-value-update';
import { useUpdatePage } from '@/lib/hooks/api/use-update-page';
import { useCreateSingleSelectOption } from '@/lib/hooks/api/use-create-single-select-option';
import { getRandomSelectColor } from '@/lib/data-source/select-colors';
import type { Column } from '@/types/schemas/entities/container';
import type { SelectColor } from '@/types/schemas/entities/container';
import type { CreateDataSourceColumnBody, GetPagesResponse, UpdateDataSourceColumnBody } from '@/types/api';

// Each data column needs at least this much room for its editable control (select/multi-select
// targets, date pickers, etc.) to render without being squeezed. With `tableLayout: 'fixed'`, the
// browser divides the available width evenly across columns without shrinking any of them
// individually to fit content, so once there are enough columns the data columns could otherwise
// be compressed below their controls' min-width, causing those controls to overflow their cell
// and visually bleed into (and intercept clicks on) neighbouring cells.
const NAME_COLUMN_MIN_WIDTH = 260;
const DATA_COLUMN_MIN_WIDTH = 140;
const DEFAULT_TABLE_MIN_WIDTH = 520;

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
  const { createOption } = useCreateSingleSelectOption(dataSourceId);
  const { showError } = useNotification();

  const handleColumnSubmit = async (values: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'single-select' | 'multi-select';
    mode?: 'date' | 'time' | 'datetime';
    displayFormat?: string;
    options?: { id: string; label: string; color: SelectColor }[];
  }) => {
    if (editingColumn) {
      const updateBody: UpdateDataSourceColumnBody =
        values.type === 'date'
          ? {
              name: values.name.trim(),
              type: 'date',
              mode: values.mode,
              displayFormat: values.displayFormat,
            }
          : values.type === 'single-select' || values.type === 'multi-select'
            ? {
                name: values.name.trim(),
                type: values.type,
                options: (values.options ?? []).map((option) => ({ ...option, label: option.label.trim() })),
              }
            : { name: values.name.trim(), type: values.type };
      await updateColumn(editingColumn.id, updateBody);
    } else {
      const createBody: CreateDataSourceColumnBody =
        values.type === 'date'
          ? {
              name: values.name.trim(),
              type: 'date',
              mode: values.mode ?? 'date',
              displayFormat: values.displayFormat ?? '',
            }
          : values.type === 'single-select' || values.type === 'multi-select'
            ? {
                name: values.name.trim(),
                type: values.type,
                options: (values.options ?? []).map((option) => ({
                  label: option.label.trim(),
                  color: option.color,
                })),
              }
            : { name: values.name.trim(), type: values.type };
      await createColumn(createBody);
    }
    mutateDataSource();
  };

  const handleColumnError = (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'Failed to save column';
    showError(errorMessage);
  };

  const handleCreateOption = async (columnId: string, label: string) => {
    const option = await createOption(columnId, { label, color: getRandomSelectColor() });
    if (!option) {
      throw new Error('Failed to create option');
    }
    // Refresh the data source so `columns` (and therefore every cell referencing this column)
    // picks up the newly-created option.
    mutateDataSource();
    return option;
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

  // Scaling the scroll container's minWidth with the column count keeps every column at least as
  // wide as its editable control, falling back to horizontal scrolling instead of squeezing
  // columns (see the constants above for rationale).
  const tableMinWidth = useMemo(
    () =>
      columns.length > 0 ? NAME_COLUMN_MIN_WIDTH + columns.length * DATA_COLUMN_MIN_WIDTH : DEFAULT_TABLE_MIN_WIDTH,
    [columns.length]
  );

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
      <Group justify="flex-end" mt="md" mb="md">
        <Button size="xs" variant="default" onClick={handleAddColumn} leftSection={<IconPlus />}>
          Add Column
        </Button>
      </Group>
      <Table.ScrollContainer minWidth={tableMinWidth} mt="lg" type="native" data-testid="data-table-scroll-container">
        <Table striped highlightOnHover w="100%" style={columns.length > 0 ? { tableLayout: 'fixed' } : undefined}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={columns.length > 0 ? { width: '30%', maxWidth: 260 } : undefined}>Name</Table.Th>
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
                onCreateOption={handleCreateOption}
              />
            ))}
            <NewPageRow
              value={newPageName}
              onChange={onPageNameChange}
              onKeyDown={handleNewPageKeyDown}
              onSubmit={() => void onPageCreate(newPageName)}
              disabled={inProgress}
              columnCount={columns.length}
            />
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <ColumnFormModal
        opened={showColumnModal}
        onClose={handleCloseModal}
        onSubmit={handleColumnSubmit}
        {...(editingColumn ? { initialValues: editingColumn } : {})}
        title={editingColumn ? 'Edit Column' : 'Add Column'}
        inProgress={columnOperationInProgress}
        onError={handleColumnError}
      />
    </>
  );
}
