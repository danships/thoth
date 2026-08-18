'use client';

import { useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { markDragEnded } from '@/lib/dnd/suppress-click-after-drag';
import { resolveDataViewColumnLayout, type ResolvedColumnLayout } from '@/lib/data-view/column-layout';
import { SYSTEM_COLUMN_DEFINITIONS } from '@/types/schemas/entities/data-view-query';
import type { Column } from '@/types/schemas/entities/container';
import type { ViewColumnLayoutItem } from '@/types/schemas/entities/data-view';

type ManagerItem = {
  id: string;
  label: string;
  visible: boolean;
};

function toManagerItems(layout: ResolvedColumnLayout['all']): ManagerItem[] {
  return layout.map((item) => {
    if (item.kind === 'name') {
      return { id: 'name', label: 'Name', visible: item.visible };
    }
    if (item.kind === 'system') {
      return { id: item.columnId, label: SYSTEM_COLUMN_DEFINITIONS[item.columnId].name, visible: item.visible };
    }
    return { id: item.column.id, label: item.column.name, visible: item.visible };
  });
}

function toLayoutItems(items: ManagerItem[]): ViewColumnLayoutItem[] {
  return items.map((item) => {
    if (item.id === 'name') {
      return { kind: 'name', visible: item.visible };
    }
    if (item.id === 'createdAt' || item.id === 'lastUpdated') {
      return { kind: 'system', columnId: item.id, visible: item.visible };
    }
    return { kind: 'data', columnId: item.id, visible: item.visible };
  });
}

type SortableManagerRowProperties = {
  item: ManagerItem;
  onToggleVisible: (id: string) => void;
  disabled: boolean;
};

function SortableManagerRow({ item, onToggleVisible, disabled }: SortableManagerRowProperties) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { zIndex: 1, position: 'relative' as const, background: 'var(--mantine-color-body)' }),
  };

  return (
    <Group ref={setNodeRef} style={style} wrap="nowrap" gap="sm" py={4} data-testid={`column-manager-row-${item.id}`}>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={`Reorder ${item.label} column`}
        data-testid={`column-manager-drag-handle-${item.id}`}
        {...attributes}
        {...listeners}
        disabled={disabled}
        style={{ cursor: disabled ? 'default' : 'grab' }}
      >
        <IconGripVertical size={14} />
      </ActionIcon>
      <Checkbox
        label={item.label}
        checked={item.visible}
        onChange={() => onToggleVisible(item.id)}
        disabled={disabled}
        data-testid={`column-manager-visible-${item.id}`}
      />
    </Group>
  );
}

type DataViewColumnManagerBodyProperties = {
  onClose: () => void;
  onApply: (layout: ViewColumnLayoutItem[]) => Promise<void> | void;
  initialLayout: ResolvedColumnLayout;
  dataSourceColumns: Column[];
  inProgress: boolean;
};

// Its own component (rather than inline JSX in `DataViewColumnManager`) so it can be given a
// `key` that changes every time the modal opens — remounting it, and therefore re-seeding
// `items` from `initialLayout` via the `useState` lazy initializer below, without reaching for
// an effect that calls `setState` synchronously (see the "Resetting state with a key" pattern:
// https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes).
function DataViewColumnManagerBody({
  onClose,
  onApply,
  initialLayout,
  dataSourceColumns,
  inProgress,
}: DataViewColumnManagerBodyProperties) {
  const [items, setItems] = useState<ManagerItem[]>(() => toManagerItems(initialLayout.all));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    markDragEnded();
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setItems((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) {
        return current;
      }
      const reordered = [...current];
      const [moved] = reordered.splice(oldIndex, 1);
      if (!moved) {
        return current;
      }
      reordered.splice(newIndex, 0, moved);
      return reordered;
    });
  };

  const handleToggleVisible = (id: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item)));
  };

  const handleShowAll = () => setItems((current) => current.map((item) => ({ ...item, visible: true })));
  const handleHideAll = () =>
    // Name always stays visible — hiding it entirely would leave a table with only the fixed
    // action gutter and no way to re-show Name from within the table itself, only the manager.
    setItems((current) => current.map((item) => (item.id === 'name' ? item : { ...item, visible: false })));
  const handleReset = () => setItems(toManagerItems(resolveDataViewColumnLayout(dataSourceColumns, [], null).all));

  const handleApply = async () => {
    await onApply(toLayoutItems(items));
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Choose which columns appear in this view&apos;s table, and in what order. Hidden columns stay available for
        filtering and sorting.
      </Text>
      <Group gap="xs">
        <Button size="xs" variant="subtle" onClick={handleShowAll} disabled={inProgress}>
          Show all
        </Button>
        <Button size="xs" variant="subtle" onClick={handleHideAll} disabled={inProgress}>
          Hide all
        </Button>
        <Button size="xs" variant="subtle" onClick={handleReset} disabled={inProgress}>
          Reset to default
        </Button>
      </Group>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <Stack gap={2} data-testid="column-manager-list">
            {items.map((item) => (
              <SortableManagerRow
                key={item.id}
                item={item}
                onToggleVisible={handleToggleVisible}
                disabled={inProgress}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={onClose} disabled={inProgress}>
          Cancel
        </Button>
        <Button onClick={() => void handleApply()} loading={inProgress} data-testid="column-manager-apply">
          Apply
        </Button>
      </Group>
    </Stack>
  );
}

type DataViewColumnManagerProperties = {
  opened: boolean;
  onClose: () => void;
  onApply: (layout: ViewColumnLayoutItem[]) => Promise<void> | void;
  layout: ResolvedColumnLayout;
  dataSourceColumns: Column[];
  inProgress?: boolean;
};

// A controlled modal (THOTH-052) exposing the *complete* column layout, including hidden
// entries, so a hidden column can be found and re-shown. Edits are staged locally (in
// `DataViewColumnManagerBody`) and only take effect on Apply — Cancel discards them entirely.
export function DataViewColumnManager({
  opened,
  onClose,
  onApply,
  layout,
  dataSourceColumns,
  inProgress = false,
}: DataViewColumnManagerProperties) {
  return (
    <Modal opened={opened} onClose={onClose} title="Columns" centered closeButtonProps={{ 'aria-label': 'Close' }}>
      {opened && (
        <DataViewColumnManagerBody
          key={String(opened)}
          onClose={onClose}
          onApply={onApply}
          initialLayout={layout}
          dataSourceColumns={dataSourceColumns}
          inProgress={inProgress}
        />
      )}
    </Modal>
  );
}
