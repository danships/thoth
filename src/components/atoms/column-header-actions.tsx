import { ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';

type ColumnHeaderActionsProperties = {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function ColumnHeaderActions({ label, onEdit, onDelete }: ColumnHeaderActionsProperties) {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label={`${label} column actions`}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item leftSection={<IconEdit size={14} />} onClick={onEdit}>
          Edit
        </Menu.Item>
        <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={onDelete}>
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
