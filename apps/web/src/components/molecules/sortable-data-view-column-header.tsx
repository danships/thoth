'use client';

import { ActionIcon, Group, Table } from '@mantine/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';

type SortableDataViewColumnHeaderProperties = {
  // `'name'` for the built-in Name header, or the Data Source `Column.id` for a data header
  // (THOTH-052). Distinct id spaces never collide since `'name'` can never be a real column id.
  id: string;
  label: string;
  style?: React.CSSProperties | undefined;
  // Edit/delete (data columns only) — rendered inside the header, never on the drag handle, so
  // clicking them never starts a drag (dnd-kit only listens for pointer/keyboard events on the
  // elements `listeners` is spread onto).
  actions?: React.ReactNode;
  disabled?: boolean;
};

export function SortableDataViewColumnHeader({
  id,
  label,
  style,
  actions,
  disabled = false,
}: SortableDataViewColumnHeaderProperties) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  const thStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { zIndex: 1, position: 'relative' as const, background: 'var(--mantine-color-body)' }),
  };

  return (
    <Table.Th ref={setNodeRef} style={thStyle} data-testid={`column-header-${id}`}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group wrap="nowrap" gap={4} miw={0}>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`Reorder ${label} column`}
            data-testid={`column-drag-handle-${id}`}
            {...attributes}
            {...listeners}
            disabled={disabled}
            style={{ cursor: disabled ? 'default' : 'grab', flexShrink: 0 }}
          >
            <IconGripVertical size={14} />
          </ActionIcon>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </Group>
        {actions}
      </Group>
    </Table.Th>
  );
}
