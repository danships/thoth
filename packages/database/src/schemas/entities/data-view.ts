import { z } from 'zod';
import { withIdSchema, withTrackUpdatesSchema, withUserIdSchema, withWorkspaceIdSchema } from '../utilities.js';
import { filterRuleSchema, sortRuleSchema } from './data-view-query.js';

export { filterOperatorSchema, filterRuleSchema, sortDirectionSchema, sortRuleSchema } from './data-view-query.js';
export type { FilterOperator, FilterRule, SortDirection, SortRule } from './data-view-query.js';

// A single entry in a Data View's persisted column presentation order/visibility (THOTH-052). A
// discriminated union rather than a magic Name id alongside Data Source column ids, so a
// (theoretical) Data Source column literally named/id'd like the built-in Name field can never
// collide with — or be confused for — it. `kind: 'data'` entries reference an embedded
// `Column.id` on the view's Data Source; `kind: 'name'` represents the page's built-in
// `Container.name` field, which every Data View implicitly has and which has no `Column` of its
// own to reference.
export const viewColumnLayoutItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('name'), visible: z.boolean() }),
  z.object({ kind: z.literal('data'), columnId: z.string().min(1), visible: z.boolean() }),
]);
export type ViewColumnLayoutItem = z.infer<typeof viewColumnLayoutItemSchema>;

export const dataViewSchema = z
  .object({
    name: z.string().min(1),
    dataSourceId: z.string().min(1),
    // Legacy page-field ordering (kept separate from `columnLayout` below, which only governs
    // this Data View's own table presentation — see `pageColumnRetriever`, which still reads
    // this array for the row page's Fields editor).
    columns: z.array(z.string().min(1)).default([]),
    // Persisted filter/sort configuration (THOTH-037) — additive, defaulted for backward
    // compatibility with rows created before this feature existed. No backfill migration is
    // needed: the `.default([])` below already fills these in on every read.
    filters: z.array(filterRuleSchema).default([]),
    sorts: z.array(sortRuleSchema).default([]),
    // Persisted table column order/visibility (THOTH-052) — additive, `null` for every view
    // created before this feature existed (and for new views, until the first layout save). No
    // backfill migration is needed: `resolveDataViewColumnLayout` resolves a `null` layout to
    // Name-first, followed by the legacy `columns` order (or Data Source order), all visible.
    columnLayout: z.array(viewColumnLayoutItemSchema).nullable().default(null),
    deletedAt: z.string().nullable(),
    deletedRootId: z.string().nullable(),
  })
  .extend(withTrackUpdatesSchema.shape)
  .extend(withWorkspaceIdSchema.shape)
  .extend(withUserIdSchema.shape)
  .extend(withIdSchema.shape);
