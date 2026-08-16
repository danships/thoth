import { ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconEdit, IconEyeOff, IconTrash } from '@tabler/icons-react';

type ColumnHeaderActionsProperties = {
  label: string;
  onEdit: () => void;
  onHide: () => void;
  onDelete: () => void;
  // Disabled while a column-layout save is in flight (THOTH-074), mirroring the drag handle's
  // existing `disabled` behavior so a second action can't queue while the first write is pending.
  disabled?: boolean;
};

export function ColumnHeaderActions({
  label,
  onEdit,
  onHide,
  onDelete,
  disabled = false,
}: ColumnHeaderActionsProperties) {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" aria-label={`${label} column actions`} disabled={disabled}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconEdit size={14} />}
          onClick={onEdit}
          disabled={disabled}
          data-testid="column-action-edit"
        >
          Edit
        </Menu.Item>
        <Menu.Item
          leftSection={<IconEyeOff size={14} />}
          onClick={onHide}
          disabled={disabled}
          data-testid="column-action-hide"
        >
          Hide column
        </Menu.Item>
        <Menu.Item
          leftSection={<IconTrash size={14} />}
          color="red"
          onClick={onDelete}
          disabled={disabled}
          data-testid="column-action-delete"
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
