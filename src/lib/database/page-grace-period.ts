import { getEnvironment } from '../environment';

export const DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS = 30;

// Matches only a complete positive safe integer (e.g. "30"), rejecting decimals ("1.5"),
// trailing/leading non-digit text ("30days"), leading zeros aside, negative numbers, and
// empty/whitespace strings — cases `Number.parseInt` would silently accept via its
// truncating, prefix-based parsing.
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function getPageDeleteGracePeriodDays(): Promise<number> {
  const environment = await getEnvironment();
  const raw = environment.PAGE_DELETE_GRACE_PERIOD_DAYS.trim();
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    return DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS;
}

// Shared by every restore path (single-item and batch, for both pages and data sources) so the
// "has the grace period expired" check is defined in exactly one place.
export function isPageDeleteGracePeriodExpired(deletedAt: string, gracePeriodDays: number): boolean {
  const deletedAtMs = Date.parse(deletedAt);
  const graceThresholdMs = Date.now() - gracePeriodDays * DAY_IN_MS;
  return Number.isNaN(deletedAtMs) || deletedAtMs <= graceThresholdMs;
}
