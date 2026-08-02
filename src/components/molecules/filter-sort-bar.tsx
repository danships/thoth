'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Popover,
  Select,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core';
import { IconArrowsSort, IconFilter, IconPlus, IconX } from '@tabler/icons-react';
import { OPERATORS_BY_COLUMN_TYPE } from '@/types/schemas/entities/data-view-query';
import type { Column } from '@/types/schemas/entities/container';
import type { FilterOperator, FilterRule, SortDirection, SortRule } from '@/types/schemas/entities/data-view-query';

// Human-readable labels for every operator supported by `OPERATORS_BY_COLUMN_TYPE` (see
// `page-query-service.ts`). Kept here rather than in the schema module since it's presentation
// concern, not a validation concern.
const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'is',
  notEquals: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  hasAnyOf: 'has any of',
  hasAllOf: 'has all of',
};

const VALUELESS_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty']);
const MULTI_VALUE_OPERATORS = new Set<FilterOperator>(['hasAnyOf', 'hasAllOf']);

type FilterSortBarProperties = {
  columns: Column[];
  filters: FilterRule[];
  sorts: SortRule[];
  onApply: (filters: FilterRule[], sorts: SortRule[]) => void;
  inProgress: boolean;
};

function defaultOperatorFor(column: Column | undefined): FilterOperator {
  return (column ? OPERATORS_BY_COLUMN_TYPE[column.type][0] : 'equals') as FilterOperator;
}

function defaultValueForOperator(operator: FilterOperator): FilterRule['value'] {
  if (VALUELESS_OPERATORS.has(operator)) {
    return null;
  }
  if (MULTI_VALUE_OPERATORS.has(operator)) {
    return [];
  }
  return '';
}

function FilterValueInput({
  column,
  rule,
  onChange,
}: {
  column: Column | undefined;
  rule: FilterRule;
  onChange: (value: FilterRule['value']) => void;
}) {
  if (!column || VALUELESS_OPERATORS.has(rule.operator)) {
    return null;
  }

  if (MULTI_VALUE_OPERATORS.has(rule.operator) && (column.type === 'single-select' || column.type === 'multi-select')) {
    return (
      <MultiSelect
        comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
        data={column.options.map((option) => ({ value: option.id, label: option.label }))}
        value={Array.isArray(rule.value) ? rule.value : []}
        onChange={onChange}
        placeholder="Select options"
        size="xs"
        w={200}
      />
    );
  }

  if (column.type === 'number') {
    return (
      <NumberInput
        value={typeof rule.value === 'number' ? rule.value : ''}
        onChange={(value) => onChange(typeof value === 'number' ? value : '')}
        size="xs"
        w={140}
      />
    );
  }

  if (column.type === 'boolean') {
    return (
      <Switch
        checked={rule.value === true}
        onChange={(event) => onChange(event.currentTarget.checked)}
        label="True"
        size="xs"
      />
    );
  }

  if (column.type === 'single-select') {
    return (
      <Select
        comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
        data={column.options.map((option) => ({ value: option.id, label: option.label }))}
        value={typeof rule.value === 'string' ? rule.value : null}
        onChange={(value) => onChange(value ?? '')}
        placeholder="Select an option"
        size="xs"
        w={160}
      />
    );
  }

  return (
    <TextInput
      value={typeof rule.value === 'string' ? rule.value : ''}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder="Value"
      size="xs"
      w={160}
    />
  );
}

/**
 * Filter/sort configuration bar for a Data View (THOTH-037). Rendered above the table; opens a
 * popover per button letting the user build a flat AND-only list of filter rules and an ordered
 * list of sort rules, then persists them via `PATCH /views/:id` (`onApply`).
 */
export function FilterSortBar({ columns, filters, sorts, onApply, inProgress }: FilterSortBarProperties) {
  const [filterDraft, setFilterDraft] = useState<FilterRule[]>(filters);
  const [sortDraft, setSortDraft] = useState<SortRule[]>(sorts);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);

  const columnsById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);

  const handleAddFilter = () => {
    const firstColumn = columns[0];
    if (!firstColumn) {
      return;
    }
    const operator = defaultOperatorFor(firstColumn);
    setFilterDraft([...filterDraft, { columnId: firstColumn.id, operator, value: defaultValueForOperator(operator) }]);
  };

  const handleAddSort = () => {
    const firstColumn = columns[0];
    if (!firstColumn) {
      return;
    }
    setSortDraft([...sortDraft, { columnId: firstColumn.id, direction: 'asc' }]);
  };

  const updateFilter = (index: number, patch: Partial<FilterRule>) => {
    setFilterDraft(filterDraft.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)));
  };

  const removeFilter = (index: number) => {
    setFilterDraft(filterDraft.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const updateSort = (index: number, patch: Partial<SortRule>) => {
    setSortDraft(sortDraft.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)));
  };

  const removeSort = (index: number) => {
    setSortDraft(sortDraft.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const handleColumnChange = (index: number, columnId: string) => {
    const column = columnsById.get(columnId);
    const operator = defaultOperatorFor(column);
    updateFilter(index, { columnId, operator, value: defaultValueForOperator(operator) });
  };

  const handleOperatorChange = (index: number, operator: FilterOperator) => {
    updateFilter(index, { operator, value: defaultValueForOperator(operator) });
  };

  const applyFilters = () => {
    onApply(filterDraft, sorts);
    setFilterPopoverOpen(false);
  };

  const applySorts = () => {
    onApply(filters, sortDraft);
    setSortPopoverOpen(false);
  };

  return (
    <Group gap="xs" data-testid="filter-sort-bar">
      <Popover
        opened={filterPopoverOpen}
        onChange={setFilterPopoverOpen}
        withArrow
        shadow="md"
        position="bottom-start"
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <Button
            size="xs"
            variant={filters.length > 0 ? 'filled' : 'default'}
            leftSection={<IconFilter size={14} />}
            onClick={() => {
              setFilterDraft(filters);
              setFilterPopoverOpen((open) => !open);
            }}
            data-testid="filter-sort-bar-filter-button"
          >
            Filter{filters.length > 0 ? ` (${filters.length})` : ''}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" miw={320}>
            {filterDraft.map((rule, index) => {
              const column = columnsById.get(rule.columnId);
              const operators = column ? (OPERATORS_BY_COLUMN_TYPE[column.type] as FilterOperator[]) : [];
              return (
                <Group key={index} gap="xs" wrap="nowrap" data-testid="filter-rule-row">
                  <Select
                    comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                    data={columns.map((col) => ({ value: col.id, label: col.name }))}
                    value={rule.columnId}
                    onChange={(value) => value && handleColumnChange(index, value)}
                    size="xs"
                    w={130}
                  />
                  <Select
                    comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                    data={operators.map((operator) => ({ value: operator, label: OPERATOR_LABELS[operator] }))}
                    value={rule.operator}
                    onChange={(value) => value && handleOperatorChange(index, value as FilterOperator)}
                    size="xs"
                    w={120}
                  />
                  <FilterValueInput column={column} rule={rule} onChange={(value) => updateFilter(index, { value })} />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => removeFilter(index)}
                    aria-label="Remove filter"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              );
            })}
            <Group justify="space-between">
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={handleAddFilter}
                disabled={columns.length === 0}
              >
                Add filter
              </Button>
              <Button size="xs" onClick={applyFilters} loading={inProgress} data-testid="apply-filters">
                Apply
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Popover
        opened={sortPopoverOpen}
        onChange={setSortPopoverOpen}
        withArrow
        shadow="md"
        position="bottom-start"
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <Button
            size="xs"
            variant={sorts.length > 0 ? 'filled' : 'default'}
            leftSection={<IconArrowsSort size={14} />}
            onClick={() => {
              setSortDraft(sorts);
              setSortPopoverOpen((open) => !open);
            }}
            data-testid="filter-sort-bar-sort-button"
          >
            Sort{sorts.length > 0 ? ` (${sorts.length})` : ''}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" miw={280}>
            {sortDraft.map((rule, index) => (
              <Group key={index} gap="xs" wrap="nowrap" data-testid="sort-rule-row">
                <Select
                  comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                  data={columns.map((col) => ({ value: col.id, label: col.name }))}
                  value={rule.columnId}
                  onChange={(value) => value && updateSort(index, { columnId: value })}
                  size="xs"
                  w={150}
                />
                <Select
                  comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                  data={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                  value={rule.direction}
                  onChange={(value) => value && updateSort(index, { direction: value as SortDirection })}
                  size="xs"
                  w={120}
                />
                <ActionIcon variant="subtle" color="red" onClick={() => removeSort(index)} aria-label="Remove sort">
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ))}
            <Group justify="space-between">
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={handleAddSort}
                disabled={columns.length === 0}
              >
                Add sort
              </Button>
              <Button size="xs" onClick={applySorts} loading={inProgress} data-testid="apply-sorts">
                Apply
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
