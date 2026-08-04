import { Table, ActionIcon } from '@mantine/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';
import { EditablePageNameCell } from '@/components/atoms/editable-page-name-cell';
import { EditableColumnValue } from '@/components/molecules/editable-column-value';
import type { Column, SingleSelectOption } from '@/types/schemas/entities/container';
import type { Page } from '@/types/api';
import type { PageValue } from '@/types/schemas/entities/container';

type DataTableRowProperties = {
  page: Page;
  values: Record<string, PageValue> | undefined;
  columns: Column[];
  onCellUpdate: (columnId: string, value: PageValue) => void;
  onPageNameUpdate: (pageId: string, name: string) => void;
  disabled?: boolean;
  onCreateOption?: ((columnId: string, label: string) => Promise<SingleSelectOption>) | undefined;
  // Manual reordering (THOTH-036) — omitted entirely (no drag handle rendered) when the view
  // has a custom sort applied and dragging is otherwise disallowed.
  dragEnabled?: boolean;
};

export function DataTableRow({
  page,
  values,
  columns,
  onCellUpdate,
  onPageNameUpdate,
  disabled = false,
  onCreateOption,
  dragEnabled = false,
}: DataTableRowProperties) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { zIndex: 1, position: 'relative' as const, background: 'var(--mantine-color-body)' }),
  };

  return (
    <Table.Tr ref={setNodeRef} style={style}>
      {dragEnabled && (
        <Table.Td style={{ width: 32 }}>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label="Reorder page"
            data-testid={`drag-handle-${page.id}`}
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab' }}
          >
            <IconGripVertical size={14} />
          </ActionIcon>
        </Table.Td>
      )}
      <Table.Td>
        <EditablePageNameCell
          value={page.name}
          emoji={page.emoji}
          pageId={page.id}
          onBlur={(name) => onPageNameUpdate(page.id, name)}
          disabled={disabled}
        />
      </Table.Td>
      {columns.map((col) => {
        const current = values?.[col.id];
        return (
          <Table.Td key={col.id}>
            <EditableColumnValue
              column={col}
              value={current}
              onChange={(value) => onCellUpdate(col.id, value)}
              disabled={disabled}
              onCreateOption={onCreateOption}
              renderStringAsMarkdown
            />
          </Table.Td>
        );
      })}
    </Table.Tr>
  );
}
