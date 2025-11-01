import { Box, Group, Table } from '@mantine/core';
import { ColumnHeaderActions } from '@/components/atoms/column-header-actions';
import type { Column } from '@/types/schemas/entities/container';
import styles from './data-table-column-header.module.css';

type DataTableColumnHeaderProperties = {
  column: Column;
  onEdit: () => void;
  onDelete: () => void;
};

export function DataTableColumnHeader({ column, onEdit, onDelete }: DataTableColumnHeaderProperties) {
  return (
    <Table.Th className={styles['columnHeaderHover'] ?? ''}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <span>{column.name}</span>
        <Box className={styles['columnHeaderActions'] ?? ''}>
          <ColumnHeaderActions onEdit={onEdit} onDelete={onDelete} />
        </Box>
      </Group>
    </Table.Th>
  );
}
