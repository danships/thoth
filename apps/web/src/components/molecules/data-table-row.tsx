import { Table, ActionIcon, Text } from '@mantine/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';
import { EditablePageNameCell } from '@/components/atoms/editable-page-name-cell';
import { PageRowActionsCell } from '@/components/atoms/page-row-actions-cell';
import { EditableColumnValue } from '@/components/molecules/editable-column-value';
import { formatDateValue } from '@/lib/data-source/date-format';
import type { ResolvedColumnLayoutItem } from '@/lib/data-view/column-layout';
import type { SingleSelectOption } from '@/types/schemas/entities/container';
import type { Page } from '@/types/api';
import type { PageValue } from '@/types/schemas/entities/container';

// Display format for the read-only `createdAt`/`lastUpdated` system columns (THOTH-078) — always
// shown with both date and time, in the viewer's local timezone (`formatDateValue` converts from
// the stored UTC ISO string via `new Date(iso)`), regardless of any per-Data-Source date column
// configuration (system columns have no `displayFormat` of their own to read).
const SYSTEM_COLUMN_DATE_FORMAT = 'DD MMM YYYY HH:mm';

type DataTableRowProperties = {
  page: Page;
  values: Record<string, PageValue> | undefined;
  // The currently *visible* layout, in resolved render order (THOTH-052) — Name may appear at
  // any position (or not at all); data columns render via a single ordered descriptor map
  // instead of always following Name.
  visibleLayout: ResolvedColumnLayoutItem[];
  onCellUpdate: (columnId: string, value: PageValue) => void;
  onPageNameUpdate: (pageId: string, name: string) => void;
  disabled?: boolean;
  onCreateOption?: ((columnId: string, label: string) => Promise<SingleSelectOption>) | undefined;
  // Manual reordering (THOTH-036) — when false, no drag-handle cell is rendered. Callers set it
  // for tables that wrap rows in a `SortableContext`. A custom sort does not disable dragging;
  // `DataViewTable.handleDragEnd` intercepts that case with a confirm modal.
  dragEnabled?: boolean;
};

export function DataTableRow({
  page,
  values,
  visibleLayout,
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
      {visibleLayout.map((item) => {
        if (item.kind === 'name') {
          return (
            <Table.Td key="name">
              <EditablePageNameCell
                value={page.name}
                emoji={page.emoji}
                onBlur={(name) => onPageNameUpdate(page.id, name)}
                disabled={disabled}
              />
            </Table.Td>
          );
        }
        if (item.kind === 'system') {
          return (
            <Table.Td key={item.columnId} style={{ overflow: 'hidden' }}>
              <Text size="sm" c="dimmed" truncate>
                {formatDateValue(page[item.columnId], SYSTEM_COLUMN_DATE_FORMAT)}
              </Text>
            </Table.Td>
          );
        }
        return (
          // `overflow: hidden` guards against native editable controls (e.g. the date input's
          // `min-width`) rendering wider than a narrow `table-layout: fixed` column and visually
          // bleeding into — and intercepting clicks meant for — the next cell.
          <Table.Td key={item.column.id} style={{ overflow: 'hidden' }}>
            <EditableColumnValue
              column={item.column}
              value={values?.[item.column.id]}
              onChange={(value) => onCellUpdate(item.column.id, value)}
              disabled={disabled}
              onCreateOption={onCreateOption}
              renderStringAsMarkdown
              pageId={page.id}
            />
          </Table.Td>
        );
      })}
      {/* Fixed action gutter (THOTH-052) — never part of `columnLayout`; keeps row navigation
          available even when Name is reordered away from the start or hidden entirely. */}
      <Table.Td style={{ width: 90 }}>
        <PageRowActionsCell pageId={page.id} pageName={page.name} />
      </Table.Td>
    </Table.Tr>
  );
}
