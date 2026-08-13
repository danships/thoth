// Page-history algorithm constants (THOTH-058/THOTH-062). Values are unchanged from the
// original `apps/web/src/lib/history` module — this is a straight relocation so the same
// algorithms can be shared by both the web save path (synchronous recording) and the jobs
// service (scheduled consolidation/retention maintenance).

// A same-author save within this window of the current head revision's `coalesceWindowEnd`
// coalesces into that revision instead of appending a new one. Each coalescing save extends the
// window, so a continuous editing session (e.g. autosave every ~1.5s) collapses into a single
// revision until the user pauses for at least this long.
export const COALESCE_WINDOW_MS = 5 * 60_000;

// Every Nth *appended* revision is written as a full `snapshot` instead of a `patch`, bounding
// forward-replay cost to at most this many patches regardless of total history length.
export const SNAPSHOT_INTERVAL = 20;

// Hard cap on the number of revisions retained per (containerId, target) stream.
export const MAX_REVISIONS = 500;

// A patch larger than this is stored as a full `snapshot` instead (content is already capped at
// 1,000,000 chars, so a snapshot is always bounded).
export const MAX_PATCH_BYTES = 2_000_000;
