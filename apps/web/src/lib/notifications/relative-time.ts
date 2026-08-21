const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** Formats an ISO notification timestamp as a deterministic English elapsed duration. */
export function formatNotificationAge(occurredAt: string, nowMs: number = Date.now()): string | null {
  const occurredAtMs = Date.parse(occurredAt);
  if (Number.isNaN(occurredAtMs)) {
    return null;
  }

  const ageMs = Math.max(0, nowMs - occurredAtMs);
  if (ageMs < MINUTE_MS) {
    return 'just now';
  }
  if (ageMs < HOUR_MS) {
    return relativeTimeFormatter.format(-Math.floor(ageMs / MINUTE_MS), 'minute');
  }
  if (ageMs < DAY_MS) {
    return relativeTimeFormatter.format(-Math.floor(ageMs / HOUR_MS), 'hour');
  }
  if (ageMs < WEEK_MS) {
    return relativeTimeFormatter.format(-Math.floor(ageMs / DAY_MS), 'day');
  }
  if (ageMs < MONTH_MS) {
    return relativeTimeFormatter.format(-Math.floor(ageMs / WEEK_MS), 'week');
  }
  if (ageMs < YEAR_MS) {
    return relativeTimeFormatter.format(-Math.floor(ageMs / MONTH_MS), 'month');
  }

  return relativeTimeFormatter.format(-Math.floor(ageMs / YEAR_MS), 'year');
}
