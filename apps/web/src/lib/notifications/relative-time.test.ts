import { describe, expect, it } from 'vitest';
import { formatNotificationAge } from './relative-time';

const NOW_MS = Date.parse('2026-08-21T12:00:00.000Z');

function occurredAt(ageMs: number): string {
  return new Date(NOW_MS - ageMs).toISOString();
}

describe('formatNotificationAge', () => {
  it.each([
    ['zero age', 0, 'just now'],
    ['future age', -MINUTE_MS, 'just now'],
    ['59 seconds', 59 * SECOND_MS, 'just now'],
    ['one minute', MINUTE_MS, '1 minute ago'],
    ['plural minutes', 3 * MINUTE_MS, '3 minutes ago'],
    ['one hour', HOUR_MS, '1 hour ago'],
    ['plural hours', 3 * HOUR_MS, '3 hours ago'],
    ['one day', DAY_MS, '1 day ago'],
    ['plural days', 3 * DAY_MS, '3 days ago'],
    ['one week', WEEK_MS, '1 week ago'],
    ['plural weeks', 2 * WEEK_MS, '2 weeks ago'],
    ['one month', MONTH_MS, '1 month ago'],
    ['plural months', 2 * MONTH_MS, '2 months ago'],
    ['one year', YEAR_MS, '1 year ago'],
    ['plural years', 2 * YEAR_MS, '2 years ago'],
  ])('formats $0', (_description, ageMs, expected) => {
    expect(formatNotificationAge(occurredAt(ageMs), NOW_MS)).toBe(expected);
  });

  it('uses the larger unit at each boundary', () => {
    expect(formatNotificationAge(occurredAt(MINUTE_MS), NOW_MS)).toBe('1 minute ago');
    expect(formatNotificationAge(occurredAt(HOUR_MS), NOW_MS)).toBe('1 hour ago');
    expect(formatNotificationAge(occurredAt(DAY_MS), NOW_MS)).toBe('1 day ago');
    expect(formatNotificationAge(occurredAt(WEEK_MS), NOW_MS)).toBe('1 week ago');
    expect(formatNotificationAge(occurredAt(MONTH_MS), NOW_MS)).toBe('1 month ago');
    expect(formatNotificationAge(occurredAt(YEAR_MS), NOW_MS)).toBe('1 year ago');
  });

  it('returns null for a malformed timestamp', () => {
    expect(formatNotificationAge('not a date', NOW_MS)).toBeNull();
  });
});

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;
