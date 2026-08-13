// Public entry point for `@thoth/shared` — pure, DB-free page-history algorithms shared between
// `@thoth/database` (synchronous save-path recording, `revision-service.ts`) and `@thoth/jobs`
// (scheduled consolidation/retention maintenance) and consumed directly by `apps/web`'s history
// API routes for read-side reconstruction. No database access, no business rules tied to a
// specific persistence layer — those stay in `@thoth/database`.

export { COALESCE_WINDOW_MS, SNAPSHOT_INTERVAL, MAX_REVISIONS, MAX_PATCH_BYTES } from './history/constants.js';
export { shouldCoalesce, nextCoalesceWindowEnd } from './history/coalesce.js';
export type { CoalesceHead } from './history/coalesce.js';
export { makePatch, applyPatch, summarise, diffOps } from './history/delta.js';
export type { ApplyPatchResult, ChangeSummary, DiffOp } from './history/delta.js';
export { nearestBaseline, reconstructAt, reconstructValuesAt } from './history/reconstruct.js';
export type { RevisionKind, ContentRevisionLike, ValuesRevisionLike } from './history/reconstruct.js';
