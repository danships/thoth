import { Table } from '@mantine/core';
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
};

export function DataTableRow({
  page,
  values,
  columns,
  onCellUpdate,
  onPageNameUpdate,
  disabled = false,
  onCreateOption,
}: DataTableRowProperties) {
  return (
    <Table.Tr>
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
