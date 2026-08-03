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

// Every operator valid for a given column `type`. Enforced both by `page-query-service.ts`
// (silently-skip semantics for stale filter/sort rules, per THOTH-037's Edge Cases) and by the
// API route handlers (which instead throw `BadRequestError` for the *same* invalid combinations
// supplied inline, since a client-supplied override should fail loudly rather than be silently
// dropped). Kept in this schema module (rather than `page-query-service.ts`, which pulls in
// server-only DB driver imports) so client components (e.g. `FilterSortBar`) can import it
// without bundling server-only code.
export const OPERATORS_BY_COLUMN_TYPE: Record<
  'string' | 'number' | 'boolean' | 'date' | 'single-select' | 'multi-select',
  readonly FilterOperator[]
> = {
  string: ['equals', 'notEquals', 'contains', 'notContains', 'isEmpty', 'isNotEmpty'],
  number: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  boolean: ['equals', 'notEquals'],
  date: ['equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  'single-select': ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'],
  'multi-select': ['hasAnyOf', 'hasAllOf', 'isEmpty', 'isNotEmpty'],
};

// Operators that require no `value` at all.
export const VALUELESS_OPERATORS = new Set<FilterOperator>(['isEmpty', 'isNotEmpty']);

// Operators whose `value` is an array of option ids (single-/multi-select only).
export const MULTI_VALUE_OPERATORS = new Set<FilterOperator>(['hasAnyOf', 'hasAllOf']);
