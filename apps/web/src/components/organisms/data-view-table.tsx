'use client';

/* eslint-disable unicorn/no-nested-ternary */
import { Alert, Button, Group, Loader, Modal, Stack, Table, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDisclosure } from '@mantine/hooks';
import { IconColumns, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  DndContext,
  type CollisionDetection,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { DataTableRow } from '@/components/molecules/data-table-row';
import { SortableDataViewColumnHeader } from '@/components/molecules/sortable-data-view-column-header';
import { ColumnHeaderActions } from '@/components/atoms/column-header-actions';
import { ColumnFormModal } from '@/components/molecules/column-form-modal';
import { NewPageRow } from '@/components/molecules/new-page-row';
import { FilterSortBar } from '@/components/molecules/filter-sort-bar';
import { DataViewColumnManager } from '@/components/molecules/data-view-column-manager';
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
import {
  resolveDataViewColumnLayout,
  toViewColumnLayoutItems,
  type ResolvedColumnLayout,
  type ResolvedColumnLayoutItem,
} from '@/lib/data-view/column-layout';
import type { Column } from '@/types/schemas/entities/container';
import type { SelectColor } from '@/types/schemas/entities/container';
import type { ViewColumnLayoutItem } from '@/types/schemas/entities/data-view';
import type { FilterRule, SortRule } from '@/types/schemas/entities/data-view-query';
import { SYSTEM_COLUMN_DEFINITIONS } from '@/types/schemas/entities/data-view-query';
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
// Width reserved for the THOTH-052 fixed "Open page" action gutter — always rendered, never
// part of `columnLayout`, so it must always be folded into `tableMinWidth` too.
const ACTION_GUTTER_WIDTH = 90;

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

function layoutItemId(item: ResolvedColumnLayoutItem): string {
  if (item.kind === 'name') {
    return 'name';
  }
  if (item.kind === 'system') {
    return item.columnId;
  }
  return item.column.id;
}

// Moves `activeId` next to `overId` within the *complete* layout (including hidden items),
// preserving every hidden item's relative order (THOTH-052) — used for both header drags and
// the Column Manager's Apply. Returns `null` when the move is a no-op or either id can't be
// found (e.g. a column deleted mid-drag).
function moveWithinLayout(
  fullLayout: ResolvedColumnLayoutItem[],
  activeId: string,
  overId: string
): ResolvedColumnLayoutItem[] | null {
  const oldIndex = fullLayout.findIndex((item) => layoutItemId(item) === activeId);
  const newIndex = fullLayout.findIndex((item) => layoutItemId(item) === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null;
  }
  const reordered = [...fullLayout];
  const [moved] = reordered.splice(oldIndex, 1);
  if (!moved) {
    return null;
  }
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

type DataViewTableProperties = {
  view: DataView;
  dataSourceId: string;
  dataSourceColumns: Column[];
  layout: ResolvedColumnLayout;
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
  onViewChange?: (() => void) | undefined;
};

export function DataViewTable({
  view,
  dataSourceId,
  dataSourceColumns,
  layout,
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
  onViewChange,
}: DataViewTableProperties) {
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [addPageModalOpened, { open: openAddPageModal, close: closeAddPageModal }] = useDisclosure(false);
  const [addPageModalName, setAddPageModalName] = useState('');
  // Optimistic override for the *rendered* layout while a header-drag or Column Manager Apply
  // save is in flight (or has just completed), reverted on failure. Cleared whenever the
  // parent's authoritative `view` advances (see the effect below), so a stale optimistic order
  // is never stuck rendered forever if the parent's revalidation lands with something different.
  const [pendingLayout, setPendingLayout] = useState<ResolvedColumnLayout | null>(null);
  const [columnLayoutSaving, setColumnLayoutSaving] = useState(false);

  // Once the parent's authoritative `view` (and therefore its resolved `layout`) advances past
  // the snapshot this component optimistically applied, drop the local override — otherwise a
  // stale optimistic order could linger forever if the parent's revalidated data ever differs
  // from what was optimistically rendered (e.g. another tab's concurrent edit).
  const lastSeenUpdatedReference = useRef(view.lastUpdated);
  useEffect(() => {
    if (lastSeenUpdatedReference.current !== view.lastUpdated) {
      lastSeenUpdatedReference.current = view.lastUpdated;
      setPendingLayout(null);
    }
  }, [view.lastUpdated]);

  // The optimistic-concurrency token to send as `expectedLastUpdated` on the *next*
  // `persistColumnLayout` call. Kept separate from `view.lastUpdated` (and updated synchronously
  // in `persistColumnLayout` on success, not just via the effect above) because `onViewChange?.()`
  // only *starts* the parent's revalidation — it doesn't await it — so `view.lastUpdated` can
  // still be stale for a render or two afterwards. Without this, a second layout mutation fired
  // right after a successful one (e.g. THOTH-074's Hide-column "Undo" toast, clickable the moment
  // the hide's save resolves) would send a now-stale token and spuriously 409.
  const expectedLastUpdatedReference = useRef(view.lastUpdated);
  useEffect(() => {
    expectedLastUpdatedReference.current = view.lastUpdated;
  }, [view.lastUpdated]);

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
  const { showError, showUndo } = useNotification();
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

  const effectiveLayout = pendingLayout ?? layout;
  const visibleDataCount = effectiveLayout.visible.filter(
    (item) => item.kind === 'data' || item.kind === 'system'
  ).length;
  const nameVisible = effectiveLayout.visible.some((item) => item.kind === 'name');

  // Kept in sync via effect (not a plain during-render assignment — banned by the
  // `react-hooks/refs` rule) so the "Undo" action inside the Hide-column toast (THOTH-074)
  // always maps its column back onto the *current* layout, even if the toast is clicked several
  // renders after the hide happened.
  const effectiveLayoutReference = useRef(effectiveLayout);
  useEffect(() => {
    effectiveLayoutReference.current = effectiveLayout;
  }, [effectiveLayout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A single `DndContext` hosts two independent `SortableContext` regions (header columns and
  // page rows, THOTH-052/THOTH-036) — but dnd-kit's collision detection considers *every*
  // registered droppable in the `DndContext`, not just the active drag's own `SortableContext`.
  // Without filtering, dragging a header can resolve `over` to a row (or vice versa), silently
  // routing the drop to the wrong region. Restrict candidates to the same group as `active`.
  const columnDragIds = useMemo(
    () => new Set(effectiveLayout.all.map((item) => layoutItemId(item))),
    [effectiveLayout]
  );
  const restrictedCollisionDetection: CollisionDetection = (arguments_) => {
    const activeIsColumn = columnDragIds.has(String(arguments_.active.id));
    const filteredContainers = arguments_.droppableContainers.filter((container) =>
      activeIsColumn ? columnDragIds.has(String(container.id)) : !columnDragIds.has(String(container.id))
    );
    return closestCenter({ ...arguments_, droppableContainers: filteredContainers });
  };

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

  // Returns whether the save succeeded (THOTH-074) so callers that want to react only on success —
  // e.g. showing an "Undo" toast after a Hide action — don't have to duplicate the rollback logic.
  const persistColumnLayout = async (reorderedFull: ResolvedColumnLayoutItem[]): Promise<boolean> => {
    const previous = effectiveLayout;
    const reorderedVisible = reorderedFull.filter((item) => item.visible);
    setPendingLayout({ all: reorderedFull, visible: reorderedVisible });
    setColumnLayoutSaving(true);
    try {
      const result = await updateDataView({
        columnLayout: toViewColumnLayoutItems(reorderedFull),
        expectedLastUpdated: expectedLastUpdatedReference.current,
      });
      if (!result) {
        throw new Error('Failed to save column layout');
      }
      expectedLastUpdatedReference.current = result.lastUpdated;
      onViewChange?.();
      return true;
    } catch (saveError) {
      setPendingLayout(previous);
      if (axios.isAxiosError(saveError) && saveError.response?.status === 409) {
        showError('This view changed elsewhere since it was loaded. The column layout has been refreshed.');
        onViewChange?.();
      } else {
        showError(saveError instanceof Error ? saveError.message : 'Failed to save column layout');
      }
      return false;
    } finally {
      setColumnLayoutSaving(false);
    }
  };

  const handleColumnManagerApply = async (canonicalItems: ViewColumnLayoutItem[]) => {
    // Resolve immediately against the live Data Source so the applied layout renders with real
    // column metadata without waiting for the parent's revalidation to complete first.
    const resolved = resolveDataViewColumnLayout(dataSourceColumns, view.columns ?? [], canonicalItems);
    await persistColumnLayout(resolved.all);
    setShowColumnManager(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    markDragEnded();
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    // A single `DndContext`/`onDragEnd` handles both the header (column) and row (page) sortable
    // regions (THOTH-052) — routed here by checking whether the dragged id belongs to the
    // current column layout, since page ids and layout ids (`'name'` or a Data Source `Column`
    // id) never collide.
    const isColumnDrag = effectiveLayout.all.some((item) => layoutItemId(item) === activeId);
    if (isColumnDrag) {
      const reordered = moveWithinLayout(effectiveLayout.all, activeId, overId);
      if (reordered) {
        void persistColumnLayout(reordered);
      }
      return;
    }

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
          onViewChange?.();

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
      // `onViewChange` threaded down from `data-view-render.tsx`). `mutatePages()` here
      // additionally forces the *current* pages query to revalidate immediately for snappier
      // feedback while that propagates.
      mutatePages();
      onViewChange?.();
    } catch (updateError) {
      showError(updateError instanceof Error ? updateError.message : 'Failed to save filters and sorts');
    }
  };

  const handleColumnSubmit = async (values: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'single-select' | 'multi-select' | 'file';
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

  // Flips a single data column's `visible` flag and reuses `persistColumnLayout` — the same
  // optimistic-apply/409-rollback path the Column Manager's Apply and header drag already use —
  // scoped to just the one column (THOTH-074). `effectiveLayoutReference` (not `effectiveLayout`
  // directly) is used so `handleShowColumn`, invoked later from the Undo toast, always maps onto
  // the layout as of whenever Undo is actually clicked rather than the one captured at hide-time.
  const handleHideColumn = (column: Column) => {
    const updated = effectiveLayoutReference.current.all.map((item) =>
      item.kind === 'data' && item.column.id === column.id ? { ...item, visible: false } : item
    );
    void persistColumnLayout(updated).then((succeeded) => {
      if (succeeded) {
        showUndo(`Hid column "${column.name}"`, () => handleShowColumn(column));
      }
    });
  };

  const handleShowColumn = (column: Column) => {
    const updated = effectiveLayoutReference.current.all.map((item) =>
      item.kind === 'data' && item.column.id === column.id ? { ...item, visible: true } : item
    );
    void persistColumnLayout(updated);
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

  const handleAddPageModalSubmit = async () => {
    const name = addPageModalName.trim();
    if (!name) {
      return;
    }
    await onPageCreate(name);
    setAddPageModalName('');
    closeAddPageModal();
  };

  const inProgress = useMemo(() => {
    return createPageInProgress || columnOperationInProgress || valueUpdateInProgress || pageUpdateInProgress;
  }, [createPageInProgress, columnOperationInProgress, valueUpdateInProgress, pageUpdateInProgress]);

  // Scaling the scroll container's minWidth with the visible column count keeps every column at
  // least as wide as its editable control, falling back to horizontal scrolling instead of
  // squeezing columns (see the constants above for rationale). The fixed action gutter is always
  // rendered, so it's always folded in too.
  const tableMinWidth = useMemo(() => {
    const dragColumnWidth = pages && pages.length > 0 ? DRAG_COLUMN_WIDTH : 0;
    if (visibleDataCount === 0 && !nameVisible) {
      return DEFAULT_TABLE_MIN_WIDTH;
    }
    const nameWidth = nameVisible ? NAME_COLUMN_MIN_WIDTH : 0;
    return dragColumnWidth + nameWidth + visibleDataCount * DATA_COLUMN_MIN_WIDTH + ACTION_GUTTER_WIDTH;
  }, [visibleDataCount, nameVisible, pages]);

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
          columns={dataSourceColumns}
          filters={view.filters ?? []}
          sorts={view.sorts ?? []}
          onApply={(filters, sorts) => void handleFilterSortApply(filters, sorts)}
          inProgress={viewUpdateInProgress}
        />
        <Group gap="xs">
          {!nameVisible && (
            <Button size="xs" variant="default" onClick={openAddPageModal} leftSection={<IconPlus />}>
              Add page
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            onClick={() => setShowColumnManager(true)}
            leftSection={<IconColumns size={16} />}
            data-testid="open-column-manager"
          >
            Columns
          </Button>
          <Button size="xs" variant="default" onClick={handleAddColumn} leftSection={<IconPlus />}>
            Add Column
          </Button>
        </Group>
      </Group>
      <DndContext sensors={sensors} collisionDetection={restrictedCollisionDetection} onDragEnd={handleDragEnd}>
        <Table.ScrollContainer minWidth={tableMinWidth} mt="lg" type="native" data-testid="data-table-scroll-container">
          <Table striped highlightOnHover w="100%" style={visibleDataCount > 0 ? { tableLayout: 'fixed' } : undefined}>
            <Table.Thead>
              <SortableContext
                items={effectiveLayout.visible.map((item) => layoutItemId(item))}
                strategy={horizontalListSortingStrategy}
              >
                <Table.Tr>
                  {pages && pages.length > 0 && <Table.Th style={{ width: DRAG_COLUMN_WIDTH }} />}
                  {effectiveLayout.visible.map((item) =>
                    item.kind === 'name' ? (
                      <SortableDataViewColumnHeader
                        key="name"
                        id="name"
                        label="Name"
                        style={visibleDataCount > 0 ? { width: '30%', maxWidth: 260 } : undefined}
                        disabled={columnLayoutSaving}
                      />
                    ) : item.kind === 'system' ? (
                      // Read-only (THOTH-078) — no `ColumnHeaderActions`: hiding happens only via
                      // the Column Manager's visibility toggle, same as how Name has no header
                      // actions either.
                      <SortableDataViewColumnHeader
                        key={item.columnId}
                        id={item.columnId}
                        label={SYSTEM_COLUMN_DEFINITIONS[item.columnId].name}
                        disabled={columnLayoutSaving}
                      />
                    ) : (
                      <SortableDataViewColumnHeader
                        key={item.column.id}
                        id={item.column.id}
                        label={item.column.name}
                        disabled={columnLayoutSaving}
                        actions={
                          <ColumnHeaderActions
                            label={item.column.name}
                            onEdit={() => handleEditColumn(item.column)}
                            onHide={() => handleHideColumn(item.column)}
                            onDelete={() => handleDeleteColumn(item.column)}
                            disabled={columnLayoutSaving}
                          />
                        }
                      />
                    )
                  )}
                  <Table.Th style={{ width: ACTION_GUTTER_WIDTH }} />
                </Table.Tr>
              </SortableContext>
            </Table.Thead>
            <SortableContext items={pages?.map(({ page }) => page.id) ?? []} strategy={verticalListSortingStrategy}>
              <Table.Tbody>
                {pages?.map(({ page, values }) => (
                  <DataTableRow
                    key={page.id}
                    page={page}
                    values={values}
                    visibleLayout={effectiveLayout.visible}
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
                  visibleLayout={effectiveLayout.visible}
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
      <DataViewColumnManager
        opened={showColumnManager}
        onClose={() => setShowColumnManager(false)}
        onApply={handleColumnManagerApply}
        layout={effectiveLayout}
        dataSourceColumns={dataSourceColumns}
        inProgress={columnLayoutSaving}
      />
      <Modal
        opened={addPageModalOpened}
        onClose={closeAddPageModal}
        title="Add page"
        centered
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        <Stack gap="sm">
          <TextInput
            placeholder="Page name"
            value={addPageModalName}
            onChange={(event) => setAddPageModalName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleAddPageModalSubmit();
              }
            }}
            data-testid="add-page-modal-name"
            autoFocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeAddPageModal}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddPageModalSubmit()}
              disabled={addPageModalName.trim().length === 0}
              loading={createPageInProgress}
              data-testid="add-page-modal-submit"
            >
              Add page
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
