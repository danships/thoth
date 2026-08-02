import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities';
import { filterRuleSchema, sortRuleSchema } from './data-view-query';

export { filterOperatorSchema, filterRuleSchema, sortDirectionSchema, sortRuleSchema } from './data-view-query';
export type { FilterOperator, FilterRule, SortDirection, SortRule } from './data-view-query';

export const dataViewSchema = z
  .object({
    name: z.string().min(1),
    dataSourceId: z.string().min(1),
    columns: z.array(z.string().min(1)),
    // Persisted filter/sort configuration (THOTH-037) — additive, defaulted for backward
    // compatibility with rows created before this feature existed (see the
    // `data-view-filters-sorts-backfill` migration, which rewrites existing rows with explicit
    // `[]` values so raw-SQL introspection doesn't have to special-case `undefined`).
    filters: z.array(filterRuleSchema).default([]),
    sorts: z.array(sortRuleSchema).default([]),
    deletedAt: z.string().nullable(),
    deletedRootId: z.string().nullable(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
