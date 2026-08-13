/**
 * Shared grace-period/race-safety-margin primitives (THOTH-063), used by every maintenance
 * purge handler (workspaces, pages/data-views, files). Extracted verbatim from the semantics of
 * the pre-monorepo `scripts/purge-deleted-*.ts` scripts so behaviour is preserved exactly across
 * the refactor into bounded job handlers — grace periods and race margins are a requirement,
 * never a redesign opportunity.
 */

// A soft-deleted/orphaned row touched within this window of "now" is skipped even if it's
// otherwise past its grace period — protects against a restore (or a fresh upload attach) racing
// concurrently with a purge scan. SuperSave has no cross-table transaction support, so this is
// the practical limit of what's achievable without database-level transactions; see
// `revalidate*ForPurge` below for the immediate-before-delete re-check that narrows the window
// further.
export const RACE_SAFETY_MARGIN_MS = 60 * 60 * 1000;

/** True only for a well-formed timestamp at or before `graceThresholdMs` — never for a malformed one. */
export function isPastGraceThreshold(timestamp: string | null | undefined, graceThresholdMs: number): boolean {
  if (!timestamp) {
    return false;
  }
  const parsedMs = Date.parse(timestamp);
  return !Number.isNaN(parsedMs) && parsedMs <= graceThresholdMs;
}

/** True only for a well-formed timestamp strictly before `nowMs - RACE_SAFETY_MARGIN_MS`. */
export function isOutsideRaceSafetyMargin(timestamp: string | null | undefined, nowMs: number): boolean {
  if (!timestamp) {
    return false;
  }
  const parsedMs = Date.parse(timestamp);
  return !Number.isNaN(parsedMs) && parsedMs <= nowMs - RACE_SAFETY_MARGIN_MS;
}

/** Computes the grace threshold (epoch ms) — timestamps at or before this are eligible for purge. */
export function graceThresholdMs(nowMs: number, gracePeriodDays: number): number {
  return nowMs - gracePeriodDays * 24 * 60 * 60 * 1000;
}

/** Computes an hours-based grace threshold (epoch ms), used by the file purge handler. */
export function graceThresholdMsFromHours(nowMs: number, gracePeriodHours: number): number {
  return nowMs - gracePeriodHours * 60 * 60 * 1000;
}
