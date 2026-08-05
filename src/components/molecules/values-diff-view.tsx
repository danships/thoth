'use client';

import { Table, Text } from '@mantine/core';
import type { PageValue } from '@/types/schemas/entities/container';

type ValuesDiffViewProperties = {
  before: Record<string, PageValue>;
  after: Record<string, PageValue>;
};

// Renders a value's underlying primitive as plain text; `multi-select` values are option ids
// joined for display since the drawer has no column metadata to resolve labels against.
function formatValue(value: PageValue | undefined): string {
  if (!value) {
    return '—';
  }
  if (value.type === 'multi-select') {
    return value.value.length > 0 ? value.value.join(', ') : '—';
  }
  if (value.type === 'single-select') {
    return value.value ?? '—';
  }
  if (value.type === 'file') {
    // No column/repository context available here to resolve a filename (unlike the webhook
    // payload's `toDisplayValue`) — keep it id-based, matching single-/multi-select above.
    return value.value ?? '—';
  }
  return String(value.value);
}

// Per-column before/after table for a `target='values'` revision. `before` is the reconstructed
// values state at the chosen revision; `after` is the page's current values — only the columns
// present in either side are shown (columns untouched since are omitted for brevity).
export function ValuesDiffView({ before, after }: ValuesDiffViewProperties) {
  const columnIds = [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted();

  if (columnIds.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No column values recorded for this revision.
      </Text>
    );
  }

  return (
    <Table striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Column</Table.Th>
          <Table.Th>At this revision</Table.Th>
          <Table.Th>Current</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {columnIds.map((columnId) => (
          <Table.Tr key={columnId}>
            <Table.Td>{columnId}</Table.Td>
            <Table.Td>{formatValue(before[columnId])}</Table.Td>
            <Table.Td>{formatValue(after[columnId])}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
