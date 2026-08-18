import { z } from 'zod';

// Every operator supported across all column types. Which operators are valid for a given
// column `type` is enforced separately (see `OPERATORS_BY_COLUMN_TYPE` in
// `src/lib/database/page-query-service.ts`) rather than encoded in this schema, since Zod's
// discriminated unions don't compose cleanly with the existing `Column`/`PageValue`
// discriminated union without duplicating every column-type branch here as well.
export const filterOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'isEmpty',
  'isNotEmpty',
  'hasAnyOf',
  'hasAllOf',
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

// `value` is intentionally loose at the schema level (validated per-operator/column-type in
// `page-query-service.ts`/the route handlers) — `isEmpty`/`isNotEmpty` don't need a value at
// all, `hasAnyOf`/`hasAllOf` need an array of option ids, everything else needs a scalar.
export const filterRuleSchema = z.object({
  columnId: z.string().min(1),
  operator: filterOperatorSchema,
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .nullable()
    .optional(),
});
export type FilterRule = z.infer<typeof filterRuleSchema>;

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export const sortRuleSchema = z.object({
  columnId: z.string().min(1),
  direction: sortDirectionSchema,
});
export type SortRule = z.infer<typeof sortRuleSchema>;

// Sentinel `columnId` for sorting on a page's `name` (THOTH-065) — `name` is a fixed attribute of
// the `Container` itself, not a dynamic Data Source column, so it never appears in a data
// source's `columns` array. Reuses the same `'name'` sentinel already established for the
// built-in Name header's drag-and-drop id (THOTH-052, see `layoutItemId` in `data-view-table.tsx`)
// since a real column id can never literally be `'name'` (column ids are always `randomUUID()`).
// Filtering on name is out of scope for THOTH-065 — only sorting.
//
// `name` is one of three sentinel "fixed `Container` attribute" ids (THOTH-078 adds the other
// two, `createdAt`/`lastUpdated` below) — a reader looking for how a non-Data-Source-column
// field is threaded through filtering/sorting should start here.
export const NAME_SORT_COLUMN_ID = 'name';

// Sentinel `columnId`s for filtering/sorting on a page's own `createdAt`/`lastUpdated`
// (THOTH-078) — real, indexed columns on the underlying `container` table (see
// `Container.filterSortFields`), populated automatically by SuperSave on insert/update, not
// dynamic Data Source columns. Unlike `NAME_SORT_COLUMN_ID`, these are usable for both
// filtering and sorting, and are also rendered as literal table columns (`kind: 'system'` in
// `viewColumnLayoutItemSchema`) since — unlike `name` — they have no dedicated table column of
// their own already.
export const CREATED_AT_COLUMN_ID = 'createdAt';
export const LAST_UPDATED_COLUMN_ID = 'lastUpdated';
export const SYSTEM_COLUMN_IDS = [CREATED_AT_COLUMN_ID, LAST_UPDATED_COLUMN_ID] as const;
export type SystemColumnId = (typeof SYSTEM_COLUMN_IDS)[number];

// Shared label source for the two system columns — read by both server validation (error
// messages) and client UI (column headers, Column Manager, Filter/Sort bar) so the display name
// isn't hardcoded in more than one place.
export const SYSTEM_COLUMN_DEFINITIONS: Record<SystemColumnId, { name: string }> = {
  [CREATED_AT_COLUMN_ID]: { name: 'Created' },
  [LAST_UPDATED_COLUMN_ID]: { name: 'Last updated' },
};

// Operators valid for a system column (THOTH-078): `createdAt`/`lastUpdated` are always-populated
// UTC ISO-8601 timestamps, never strings to substring-match or optional fields — `contains`/
// `notContains`/`hasAnyOf`/`hasAllOf` don't apply, and `isEmpty`/`isNotEmpty` are meaningless
// (the field is never null) so are intentionally excluded rather than silently always-true/false.
export const SYSTEM_COLUMN_OPERATORS: readonly FilterOperator[] = ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte'];

// Every operator valid for a given column `type`. Enforced both by `page-query-service.ts`
// (silently-skip semantics for stale filter/sort rules, per THOTH-037's Edge Cases) and by the
// API route handlers (which instead throw `BadRequestError` for the *same* invalid combinations
// supplied inline, since a client-supplied override should fail loudly rather than be silently
// dropped). Kept in this schema module (rather than `page-query-service.ts`, which pulls in
// server-only DB driver imports) so client components (e.g. `FilterSortBar`) can import it
// without bundling server-only code.
export const OPERATORS_BY_COLUMN_TYPE: Record<
  'string' | 'number' | 'boolean' | 'date' | 'single-select' | 'multi-select' | 'file',
  readonly FilterOperator[]
> = {
  string: ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty'],
  number: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  boolean: ['equals', 'notEquals'],
  date: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  'single-select': ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'],
  'multi-select': ['hasAnyOf', 'hasAllOf', 'isEmpty', 'isNotEmpty'],
  // A file column is only filterable by presence, not content (THOTH-054).
  file: ['isEmpty', 'isNotEmpty'],
};

// Operators that require no `value` at all.
export const VALUELESS_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty']);

// Operators whose `value` is an array of option ids (single-/multi-select only).
export const MULTI_VALUE_OPERATORS = new Set<FilterOperator>(['hasAnyOf', 'hasAllOf']);
