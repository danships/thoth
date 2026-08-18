import { ActionIcon, Table, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { ResolvedColumnLayoutItem } from '@/lib/data-view/column-layout';

type NewPageRowProperties = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  disabled?: boolean;
  // The currently *visible* layout (THOTH-052) — used to place the "New page name" input at
  // Name's resolved position (rather than always first) and to render an empty cell for every
  // other visible item, plus the fixed trailing action-gutter cell. When Name isn't visible,
  // this row renders nothing at all — page creation instead goes through the toolbar's "Add
  // page" modal (see `DataViewTable`), since there'd otherwise be no visible place to type a
  // name inline.
  visibleLayout: ResolvedColumnLayoutItem[];
  // When the table renders a leading drag-handle column (THOTH-036), this row needs a matching
  // empty cell so its cells still line up with the header.
  hasDragColumn?: boolean;
};

export function NewPageRow({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  disabled = false,
  visibleLayout,
  hasDragColumn = false,
}: NewPageRowProperties) {
  const nameIsVisible = visibleLayout.some((item) => item.kind === 'name');
  if (!nameIsVisible) {
    return null;
  }

  return (
    <Table.Tr>
      {hasDragColumn && <Table.Td />}
      {visibleLayout.map((item, index) =>
        item.kind === 'name' ? (
          <Table.Td key="name">
            <TextInput
              placeholder="New page name"
              value={value}
              onChange={(event) => onChange(event.currentTarget.value)}
              onKeyDown={onKeyDown}
              disabled={disabled}
              rightSection={
                <ActionIcon
                  variant="subtle"
                  aria-label="Add page"
                  disabled={disabled || value.trim().length === 0}
                  onClick={onSubmit}
                >
                  <IconPlus size={16} />
                </ActionIcon>
              }
            />
          </Table.Td>
        ) : (
          <Table.Td key={item.kind === 'data' ? item.column.id : (item.columnId ?? index)} />
        )
      )}
      {/* Fixed trailing action-gutter cell — never part of `columnLayout`. */}
      <Table.Td />
    </Table.Tr>
  );
}
