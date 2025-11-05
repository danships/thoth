/* eslint-disable unicorn/no-nested-ternary */
import { Table } from '@mantine/core';
import { EditablePageNameCell } from '@/components/atoms/editable-page-name-cell';
import { EditableTextCell } from '@/components/atoms/editable-text-cell';
import { EditableBooleanCell } from '@/components/atoms/editable-boolean-cell';
import { EditableDateCell } from '@/components/atoms/editable-date-cell';
import type { Column } from '@/types/schemas/entities/container';
import type { Page } from '@/types/api';
import type { PageValue } from '@/types/schemas/entities/container';

type DataTableRowProperties = {
  page: Page;
  values: Record<string, PageValue> | undefined;
  columns: Column[];
  onCellUpdate: (columnId: string, value: PageValue) => void;
  onPageNameUpdate: (pageId: string, name: string) => void;
  disabled?: boolean;
};

export function DataTableRow({
  page,
  values,
  columns,
  onCellUpdate,
  onPageNameUpdate,
  disabled = false,
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
        if (col.type === 'boolean') {
          return (
            <Table.Td key={col.id}>
              <EditableBooleanCell
                value={current?.type === 'boolean' ? current.value : false}
                onChange={(checked) => onCellUpdate(col.id, { type: 'boolean', value: checked })}
                disabled={disabled}
              />
            </Table.Td>
          );
        }

        if (col.type === 'date') {
          const dateOptions =
            col.options && (col.options.dateFormat || col.options.includeTime !== undefined)
              ? {
                  ...(col.options.dateFormat ? { dateFormat: col.options.dateFormat } : {}),
                  ...(col.options.includeTime === undefined ? {} : { includeTime: col.options.includeTime }),
                }
              : undefined;
          return (
            <Table.Td key={col.id}>
              <EditableDateCell
                value={current?.type === 'date' ? current.value : null}
                onBlur={(value) => onCellUpdate(col.id, { type: 'date', value })}
                disabled={disabled}
                {...(dateOptions ? { options: dateOptions } : {})}
              />
            </Table.Td>
          );
        }

        return (
          <Table.Td key={col.id}>
            <EditableTextCell
              value={
                col.type === 'number'
                  ? typeof current?.value === 'number'
                    ? current.value
                    : null
                  : typeof current?.value === 'string'
                    ? current.value
                    : null
              }
              onBlur={(value) => {
                if (col.type === 'number') {
                  onCellUpdate(col.id, { type: 'number', value: value as number });
                } else {
                  onCellUpdate(col.id, { type: 'string', value: value as string });
                }
              }}
              disabled={disabled}
              type={col.type}
            />
          </Table.Td>
        );
      })}
    </Table.Tr>
  );
}
