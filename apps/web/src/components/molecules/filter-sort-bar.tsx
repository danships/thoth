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
import {
  NAME_SORT_COLUMN_ID,
  OPERATORS_BY_COLUMN_TYPE,
  SYSTEM_COLUMN_DEFINITIONS,
  SYSTEM_COLUMN_IDS,
  SYSTEM_COLUMN_OPERATORS,
  type SystemColumnId,
} from '@/types/schemas/entities/data-view-query';
import type { Column } from '@/types/schemas/entities/container';
import type { FilterOperator, FilterRule, SortDirection, SortRule } from '@/types/schemas/entities/data-view-query';

// Millisecond-precision counterparts to `@/lib/data-source/date-format`'s `toInputValue`/
// `toIsoFromInput` (which are minute-precision for `datetime` mode, matching `date` Column
// display presets) — used only for the `createdAt`/`lastUpdated` system-column filter input,
// whose stored value is a full-precision `Date.toISOString()` timestamp (see `FilterValueInput`
// below for the full rationale).
function toSystemColumnInputValue(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function fromSystemColumnInputValue(inputValue: string): string {
  if (!inputValue) return '';
  const date = new Date(inputValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

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

function isSystemColumnId(columnId: string): columnId is SystemColumnId {
  return (SYSTEM_COLUMN_IDS as readonly string[]).includes(columnId);
}

// Pseudo-`Column`-like entries for the two built-in system columns (THOTH-078) — deliberately
// *not* shaped as `Column`'s `date` variant, since that requires per-column `mode`/`displayFormat`
// configurability that these fixed fields don't have. Used only to drive the Filter/Sort bar's
// dropdown label + id; `FilterValueInput` below renders a dedicated date/time picker for these
// rather than reusing the `date` column type's value input branch.
const SYSTEM_PSEUDO_COLUMNS: { id: SystemColumnId; name: string }[] = SYSTEM_COLUMN_IDS.map((id) => ({
  id,
  name: SYSTEM_COLUMN_DEFINITIONS[id].name,
}));

type FilterSortBarProperties = {
  columns: Column[];
  filters: FilterRule[];
  sorts: SortRule[];
  onApply: (filters: FilterRule[], sorts: SortRule[]) => void;
  inProgress: boolean;
};

function defaultOperatorFor(columnId: string | undefined, column: Column | undefined): FilterOperator {
  if (columnId && isSystemColumnId(columnId)) {
    return SYSTEM_COLUMN_OPERATORS[0] ?? 'equals';
  }
  return (column ? OPERATORS_BY_COLUMN_TYPE[column.type][0] : 'equals') as FilterOperator;
}

// Derives a default `value` typed to match the column, so a freshly-added/changed filter rule
// is immediately valid rather than sending an empty string to a `boolean`/`number` column (which
// the query layer would compare/bind as the wrong type — e.g. `better-sqlite3` rejecting a raw
// JS boolean, or `''` never numerically comparing as expected).
function defaultValueForOperator(operator: FilterOperator, columnType?: Column['type']): FilterRule['value'] {
  if (VALUELESS_OPERATORS.has(operator)) {
    return null;
  }
  if (MULTI_VALUE_OPERATORS.has(operator)) {
    return [];
  }
  if (columnType === 'boolean') {
    return false;
  }
  if (columnType === 'number') {
    return 0;
  }
  return '';
}

function FilterValueInput({
  column,
  systemColumnId,
  rule,
  onChange,
}: {
  column: Column | undefined;
  systemColumnId: SystemColumnId | undefined;
  rule: FilterRule;
  onChange: (value: FilterRule['value']) => void;
}) {
  if (VALUELESS_OPERATORS.has(rule.operator)) {
    return null;
  }

  // `createdAt`/`lastUpdated` (THOTH-078) are fixed `Container` attributes, not a `date` Column
  // (which requires per-column `mode`/`displayFormat` these fields don't have) — a dedicated
  // date/time picker rather than reusing `EditableDateCell`'s `Column`-driven rendering path.
  //
  // Unlike a `date` Column's `datetime` mode (which is minute-precision by design, matching its
  // `DATETIME_PRESETS` display formats), `createdAt`/`lastUpdated` are stored with millisecond
  // precision (`Date.toISOString()`). `toInputValue`/`toIsoFromInput`'s `datetime` mode truncates
  // to `YYYY-MM-DDTHH:mm`, which would silently drop seconds/milliseconds from an `equals`/
  // `notEquals` filter's value, making it unable to ever match. Render/parse with full
  // second+millisecond precision here instead, with a matching `step` so the native picker
  // exposes that precision.
  if (systemColumnId) {
    const isoValue = typeof rule.value === 'string' ? rule.value : '';
    return (
      <input
        type="datetime-local"
        step="0.001"
        value={isoValue ? toSystemColumnInputValue(isoValue) : ''}
        onChange={(event) => onChange(fromSystemColumnInputValue(event.target.value))}
        style={{ height: 30, fontSize: 'var(--mantine-font-size-xs)' }}
      />
    );
  }

  if (!column) {
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
        miw={160}
        style={{ flex: '1 1 160px' }}
      />
    );
  }

  if (column.type === 'number') {
    return (
      <NumberInput
        value={typeof rule.value === 'number' ? rule.value : ''}
        onChange={(value) => onChange(typeof value === 'number' ? value : '')}
        size="xs"
        miw={110}
        style={{ flex: '1 1 110px' }}
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
        miw={130}
        style={{ flex: '1 1 130px' }}
      />
    );
  }

  return (
    <TextInput
      value={typeof rule.value === 'string' ? rule.value : ''}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder="Value"
      size="xs"
      miw={130}
      style={{ flex: '1 1 130px' }}
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

  // Keep both drafts in sync with the persisted `filters`/`sorts` props whenever they change
  // (e.g. right after the *other* popover's `onApply` round-trips through the parent's
  // revalidation) — using React's "adjust state during render" pattern rather than a
  // `useEffect`, mirroring `useDataViewPages`'s `previousBaseKey` trick, to avoid an extra
  // cascading-render commit. Without this, `applyFilters`/`applySorts` could submit a stale
  // sibling draft and silently revert the other's just-applied change (see THOTH-037 review).
  const [previousFilters, setPreviousFilters] = useState(filters);
  if (filters !== previousFilters) {
    setPreviousFilters(filters);
    setFilterDraft(filters);
  }
  const [previousSorts, setPreviousSorts] = useState(sorts);
  if (sorts !== previousSorts) {
    setPreviousSorts(sorts);
    setSortDraft(sorts);
  }

  const columnsById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);

  // A page's `name` is a fixed `Container` attribute, not a Data Source column (THOTH-065) — it
  // never appears in `columns`, but is always sortable (unlike filtering, which stays scoped to
  // real columns). Modeled as a pseudo `Column` matching `stringColumnSchema`'s shape so it slots
  // into the same sort `Select` as real columns; listed first since it's the one column every
  // view always has. `createdAt`/`lastUpdated` (THOTH-078) are likewise fixed `Container`
  // attributes, listed right after Name, and — unlike `name` — also filterable (see
  // `filterableColumns` below).
  const sortableColumns = useMemo<Column[]>(
    () => [
      { id: NAME_SORT_COLUMN_ID, name: 'Name', type: 'string' },
      ...SYSTEM_PSEUDO_COLUMNS.map((pseudo) => ({ id: pseudo.id, name: pseudo.name, type: 'string' as const })),
      ...columns.filter((column) => column.type !== 'file'),
    ],
    [columns]
  );

  // Filterable columns (THOTH-037/THOTH-078): real Data Source columns plus the two system
  // pseudo-columns — unlike `sortableColumns`, `name` itself is intentionally excluded (filtering
  // on name is out of scope, THOTH-065). System pseudo-columns are appended *after* the real
  // columns so "Add filter" still defaults to the first real column (preserving prior behaviour
  // for existing filter flows, which assume a filterable, `contains`-capable default column).
  const filterableColumns = useMemo<Column[]>(
    () => [
      ...columns,
      ...SYSTEM_PSEUDO_COLUMNS.map((pseudo) => ({ id: pseudo.id, name: pseudo.name, type: 'string' as const })),
    ],
    [columns]
  );

  const handleAddFilter = () => {
    const firstColumn = filterableColumns[0];
    if (!firstColumn) {
      return;
    }
    const operator = defaultOperatorFor(firstColumn.id, isSystemColumnId(firstColumn.id) ? undefined : firstColumn);
    setFilterDraft([
      ...filterDraft,
      {
        columnId: firstColumn.id,
        operator,
        value: defaultValueForOperator(operator, isSystemColumnId(firstColumn.id) ? undefined : firstColumn.type),
      },
    ]);
  };

  const handleAddSort = () => {
    const firstColumn = sortableColumns[0];
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
    if (isSystemColumnId(columnId)) {
      const operator = defaultOperatorFor(columnId, undefined);
      updateFilter(index, { columnId, operator, value: defaultValueForOperator(operator, undefined) });
      return;
    }
    const column = columnsById.get(columnId);
    const operator = defaultOperatorFor(columnId, column);
    updateFilter(index, { columnId, operator, value: defaultValueForOperator(operator, column?.type) });
  };

  const handleOperatorChange = (index: number, operator: FilterOperator) => {
    const currentColumnId = filterDraft[index]?.columnId ?? '';
    if (isSystemColumnId(currentColumnId)) {
      updateFilter(index, { operator, value: defaultValueForOperator(operator, undefined) });
      return;
    }
    const column = columnsById.get(currentColumnId);
    updateFilter(index, { operator, value: defaultValueForOperator(operator, column?.type) });
  };

  const applyFilters = () => {
    onApply(filterDraft, sortDraft);
    setFilterPopoverOpen(false);
  };

  const applySorts = () => {
    onApply(filterDraft, sortDraft);
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
        <Popover.Dropdown style={{ maxWidth: 'calc(100vw - 2rem)' }}>
          <Stack gap="xs" miw={0} w={320} maw="100%">
            {filterDraft.map((rule, index) => {
              const systemColumnId = isSystemColumnId(rule.columnId) ? rule.columnId : undefined;
              const column = systemColumnId ? undefined : columnsById.get(rule.columnId);
              let operators: FilterOperator[] = [];
              if (systemColumnId) {
                operators = [...SYSTEM_COLUMN_OPERATORS];
              } else if (column) {
                operators = OPERATORS_BY_COLUMN_TYPE[column.type] as FilterOperator[];
              }
              return (
                <Group key={index} gap="xs" wrap="wrap" data-testid="filter-rule-row">
                  <Select
                    comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                    data={filterableColumns.map((col) => ({ value: col.id, label: col.name }))}
                    value={rule.columnId}
                    onChange={(value) => value && handleColumnChange(index, value)}
                    size="xs"
                    miw={110}
                    style={{ flex: '1 1 110px' }}
                  />
                  <Select
                    comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                    data={operators.map((operator) => ({ value: operator, label: OPERATOR_LABELS[operator] }))}
                    value={rule.operator}
                    onChange={(value) => value && handleOperatorChange(index, value as FilterOperator)}
                    size="xs"
                    miw={100}
                    style={{ flex: '1 1 100px' }}
                  />
                  <FilterValueInput
                    column={column}
                    systemColumnId={systemColumnId}
                    rule={rule}
                    onChange={(value) => updateFilter(index, { value })}
                  />
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
                disabled={filterableColumns.length === 0}
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
        <Popover.Dropdown style={{ maxWidth: 'calc(100vw - 2rem)' }}>
          <Stack gap="xs" miw={0} w={280} maw="100%">
            {sortDraft.map((rule, index) => (
              <Group key={index} gap="xs" wrap="wrap" data-testid="sort-rule-row">
                <Select
                  comboboxProps={{ transitionProps: { duration: 0 }, withinPortal: false }}
                  data={sortableColumns.map((col) => ({ value: col.id, label: col.name }))}
                  value={rule.columnId}
                  onChange={(value) => value && updateSort(index, { columnId: value })}
                  size="xs"
                  miw={130}
                  style={{ flex: '1 1 130px' }}
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
                  miw={110}
                  style={{ flex: '1 1 110px' }}
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
                disabled={sortableColumns.length === 0}
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
