import { Table, TextInput } from '@mantine/core';

type NewPageRowProperties = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  columnCount: number;
};

export function NewPageRow({ value, onChange, onKeyDown, disabled = false, columnCount }: NewPageRowProperties) {
  return (
    <Table.Tr>
      <Table.Td>
        <TextInput
          placeholder="New page name"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
      </Table.Td>
      {Array.from({ length: columnCount }).map((_, index) => (
        <Table.Td key={index} />
      ))}
    </Table.Tr>
  );
}
