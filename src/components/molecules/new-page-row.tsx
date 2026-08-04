import { ActionIcon, Table, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

type NewPageRowProperties = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  disabled?: boolean;
  columnCount: number;
  // When the table renders a leading drag-handle column (THOTH-036), this row needs a matching
  // empty cell so the "New page name" input still lines up under the "Name" column.
  hasDragColumn?: boolean;
};

export function NewPageRow({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  disabled = false,
  columnCount,
  hasDragColumn = false,
}: NewPageRowProperties) {
  return (
    <Table.Tr>
      {hasDragColumn && <Table.Td />}
      <Table.Td>
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
      {Array.from({ length: columnCount }).map((_, index) => (
        <Table.Td key={index} />
      ))}
    </Table.Tr>
  );
}
