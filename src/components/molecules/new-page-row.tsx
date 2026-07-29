import { ActionIcon, Table, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

type NewPageRowProperties = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  disabled?: boolean;
  columnCount: number;
};

export function NewPageRow({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  disabled = false,
  columnCount,
}: NewPageRowProperties) {
  return (
    <Table.Tr>
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
