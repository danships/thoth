'use client';

/* eslint-disable unicorn/no-nested-ternary */
import { Alert, Button, Group, Loader, Stack, Table } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DataTableRow } from '@/components/molecules/data-table-row';
import { DataTableColumnHeader } from '@/components/molecules/data-table-column-header';
import { ColumnFormModal } from '@/components/molecules/column-form-modal';
import { NewPageRow } from '@/components/molecules/new-page-row';
import { FilterSortBar } from '@/components/molecules/filter-sort-bar';
import { useNotification } from '@/lib/hooks/use-notification';
import { useDataViewColumns } from '@/lib/hooks/api/use-data-view-columns';
import { usePageValueUpdate } from '@/lib/hooks/api/use-page-value-update';
import { useUpdatePage } from '@/lib/hooks/api/use-update-page';
import { useUpdateDataView } from '@/lib/hooks/api/use-update-data-view';
import { useReorderPage } from '@/lib/hooks/api/use-reorder-page';
import { useCreateSingleSelectOption } from '@/lib/hooks/api/use-create-single-select-option';
import { getRandomSelectColor } from '@/lib/data-source/select-colors';
import { swrFetcher } from '@/lib/swr/fetcher';
import { markDragEnded } from '@/lib/dnd/suppress-click-after-drag';
import type { Column } from '@/types/schemas/entities/container';
import type { SelectColor } from '@/types/schemas/entities/container';
import type { FilterRule, SortRule } from '@/types/schemas/entities/data-view-query';
import {
  GET_PAGES_ENDPOINT,
  type CreateDataSourceColumnBody,
  type DataView,
  type GetPagesResponse,
  type UpdateDataSourceColumnBody,
} from '@/types/api';
import { useSWRConfig } from 'swr';

// Each data column needs at least this much room for its editable control (select/multi-select
// targets, date pickers, etc.) to render without being squeezed. With `tableLayout: 'fixed'`, the
// browser divides the available width evenly across columns without shrinking any of them
// individually to fit content, so once there are enough columns the data columns could otherwise
// be compressed below their controls' min-width, causing those controls to overflow their cell
// and visually bleed into (and intercept clicks on) neighbouring cells.
const NAME_COLUMN_MIN_WIDTH = 260;
const DATA_COLUMN_MIN_WIDTH = 140;
const DEFAULT_TABLE_MIN_WIDTH = 520;
// Width reserved for the THOTH-036 drag-handle column, shown whenever there's at least one page
// row. Must be folded into `tableMinWidth` below — otherwise, with `tableLayout: 'fixed'`, the
// browser silently shrinks the data columns to make room for it, squeezing their editable
// controls below their min-width and causing them to overlap/intercept clicks meant for a
// neighbouring cell.
const DRAG_COLUMN_WIDTH = 32;

// Pure helper: given the currently-known page order, compute the array with `activeId` moved
// next to `overId`, plus the moved page's new neighbour IDs (used as reorder anchors). Returns
// `null` when the move is a no-op or the pages aren't loaded yet.
function computeReorder(sourcePages: GetPagesResponse | undefined, activeId: string, overId: string) {
  if (!sourcePages) {
    return null;
  }
  const oldIndex = sourcePages.findIndex(({ page }) => page.id === activeId);
  const newIndex = sourcePages.findIndex(({ page }) => page.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null;
  }

  const reordered = [...sourcePages];
  const [moved] = reordered.splice(oldIndex, 1);
  if (!moved) {
    return null;
  }
  reordered.splice(newIndex, 0, moved);

  const movedNewIndex = reordered.findIndex(({ page }) => page.id === activeId);
  const beforeId = reordered[movedNewIndex - 1]?.page.id ?? null;
  const afterId = reordered[movedNewIndex + 1]?.page.id ?? null;

  return { reordered, beforeId, afterId };
}

type DataViewTableProperties = {
  view: DataView;
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
  ) => Promise<GetPagesResponse | undefined>;
  mutateDataSource: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  onFilterSortChange?: (() => void) | undefined;
};

export function DataViewTable({
  view,
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
  hasMore,
  onLoadMore,
  loadingMore,
  onFilterSortChange,
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
  const { updateDataView, inProgress: viewUpdateInProgress } = useUpdateDataView(view.id);
  const { reorderPage } = useReorderPage();
  const { mutate: mutateGlobal } = useSWRConfig();

  // Manual reordering (THOTH-036) only makes sense on the default (unsorted) view — dragging
  // while a custom sort is active would silently be overridden by that sort on the next
  // revalidation, so instead of reordering we intercept the drop with a confirm modal.
  const hasCustomSort = (view.sorts?.length ?? 0) > 0;

  // The `dataSourceId`-based SWR key `useDataViewPages`'s legacy (non-cursor) path uses — see
  // `usePagesByDataSource`. Needed below so the "clear sort, then reorder" flow can update that
  // cache directly, bypassing the `mutatePages` prop entirely (see the comment in
  // `handleDragEnd`'s `onConfirm`).
  const legacyPagesKey = `${GET_PAGES_ENDPOINT}?dataSourceId=${dataSourceId}&includeValues=true`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const applyReorder = (activeId: string, overId: string) => {
    const previousPages = pages;
    const result = computeReorder(previousPages, activeId, overId);
    if (!result) {
      return;
    }
    const { reordered, beforeId, afterId } = result;

    mutatePages(() => reordered, { revalidate: false });

    reorderPage(activeId, { beforeId, afterId }).catch((reorderError) => {
      // Roll back to the pre-drag order on failure.
      mutatePages(() => previousPages, { revalidate: false });
      showError(reorderError instanceof Error ? reorderError.message : 'Failed to reorder page');
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    markDragEnded();
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    if (!hasCustomSort) {
      applyReorder(activeId, overId);
      return;
    }

    modals.openConfirmModal({
      title: 'Custom sort applied',
      children:
        'This view has a custom sort applied. Manual ordering is only available without a custom sort. Remove the custom sort to reorder manually?',
      labels: { confirm: 'Remove sort & reorder', cancel: 'Keep sort' },
      onConfirm: async () => {
        try {
          await updateDataView({ sorts: [] });
          onFilterSortChange?.();

          // Clearing `view.sorts` flips `useDataViewPages` from the cursor-paginated `viewId`
          // query (active while a custom sort/filter exists) to the legacy `dataSourceId` fetch
          // — but only on the *next* render, since `view` is owned by the parent's SWR cache and
          // can't re-render within this same synchronous continuation. The `mutatePages` prop
          // captured by this closure is still bound to the (about to become inactive)
          // cursor-path hook, so using it here would update a cache nothing will render from
          // once the switch happens. Instead, fetch the fresh manual-order pages directly from
          // the legacy endpoint and write straight into its SWR cache via the global `mutate`,
          // independent of whichever hook is "active" this render.
          const freshPages = (await swrFetcher(legacyPagesKey)) as GetPagesResponse;
          const result = computeReorder(freshPages, activeId, overId);
          if (!result) {
            showError('The sort was removed, but the page could not be reordered. Try dragging it again.');
            return;
          }
          const { reordered, beforeId, afterId } = result;

          await mutateGlobal(legacyPagesKey, reordered, { revalidate: false });

          try {
            await reorderPage(activeId, { beforeId, afterId });
          } catch (reorderError) {
            await mutateGlobal(legacyPagesKey, freshPages, { revalidate: false });
            showError(reorderError instanceof Error ? reorderError.message : 'Failed to reorder page');
          }
        } catch (updateError) {
          showError(updateError instanceof Error ? updateError.message : 'Failed to remove custom sort');
        }
      },
    });
  };

  const handleFilterSortApply = async (filters: FilterRule[], sorts: SortRule[]) => {
    try {
      await updateDataView({ filters, sorts });
      // The new filters/sorts only take effect once the underlying `pages` query re-runs. Since
      // `useDataViewPages` derives its query key from `view.filters`/`view.sorts`, and `view` is
      // owned by the parent page's `usePageDetails` SWR cache (not this component), the parent
      // is responsible for revalidating `pageDetails` after a successful update (see
      // `onFilterSortChange` threaded down from `data-view-render.tsx`). `mutatePages()` here
      // additionally forces the *current* pages query to revalidate immediately for snappier
      // feedback while that propagates.
      mutatePages();
      onFilterSortChange?.();
    } catch (updateError) {
      showError(updateError instanceof Error ? updateError.message : 'Failed to save filters and sorts');
    }
  };

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
  const tableMinWidth = useMemo(() => {
    const dragColumnWidth = pages && pages.length > 0 ? DRAG_COLUMN_WIDTH : 0;
    return columns.length > 0
      ? dragColumnWidth + NAME_COLUMN_MIN_WIDTH + columns.length * DATA_COLUMN_MIN_WIDTH
      : DEFAULT_TABLE_MIN_WIDTH;
  }, [columns.length, pages]);

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
      <Group justify="space-between" mt="md" mb="md" wrap="wrap">
        <FilterSortBar
          columns={columns}
          filters={view.filters ?? []}
          sorts={view.sorts ?? []}
          onApply={(filters, sorts) => void handleFilterSortApply(filters, sorts)}
          inProgress={viewUpdateInProgress}
        />
        <Button size="xs" variant="default" onClick={handleAddColumn} leftSection={<IconPlus />}>
          Add Column
        </Button>
      </Group>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table.ScrollContainer minWidth={tableMinWidth} mt="lg" type="native" data-testid="data-table-scroll-container">
          <Table striped highlightOnHover w="100%" style={columns.length > 0 ? { tableLayout: 'fixed' } : undefined}>
            <Table.Thead>
              <Table.Tr>
                {pages && pages.length > 0 && <Table.Th style={{ width: DRAG_COLUMN_WIDTH }} />}
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
            <SortableContext items={pages?.map(({ page }) => page.id) ?? []} strategy={verticalListSortingStrategy}>
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
                    dragEnabled
                  />
                ))}
                <NewPageRow
                  value={newPageName}
                  onChange={onPageNameChange}
                  onKeyDown={handleNewPageKeyDown}
                  onSubmit={() => void onPageCreate(newPageName)}
                  disabled={inProgress}
                  columnCount={columns.length}
                  hasDragColumn={Boolean(pages && pages.length > 0)}
                />
              </Table.Tbody>
            </SortableContext>
          </Table>
        </Table.ScrollContainer>
      </DndContext>
      {hasMore && (
        <Group justify="center" mt="md">
          <Button size="xs" variant="default" onClick={onLoadMore} loading={loadingMore} data-testid="load-more-pages">
            Load more
          </Button>
        </Group>
      )}
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
