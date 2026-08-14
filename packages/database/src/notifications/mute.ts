import { z } from 'zod';

/**
 * Pure, dependency-free notification-mute evaluator (THOTH-071).
 *
 * Both `apps/web` (for the settings-projection endpoint) and `apps/jobs` (for the dispatch
 * handler's per-recipient push decision) import this module. Deliberately imports NO date
 * library — every timezone/quiet-window evaluation is done via `Intl.DateTimeFormat`, so the
 * evaluator has no dependency on cron/tz/luxon and the persisted user choice (IANA zone name +
 * weekday-and-minute windows) is never materialised into UTC intervals.
 */

// A string is a valid IANA timezone iff `Intl.DateTimeFormat` accepts it without throwing.
// Node/Chrome both back `Intl` with ICU/tzdata so this is the canonical, dependency-free check.
export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => {
    try {
      // eslint-disable-next-line no-new -- side effect: validate the timezone by construction
      new Intl.DateTimeFormat('en-GB', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Not a valid IANA timezone identifier');

/**
 * One recurring quiet-hours window. `day` uses JS `Date.getDay()` semantics
 * (0 = Sunday, 6 = Saturday). `startMinutes`/`endMinutes` are minutes-since-local-midnight in
 * the user's persisted `timezone`. A window with `endMinutes <= startMinutes` wraps past
 * midnight into the *next* local day — e.g. `{ day: 5, startMinutes: 22*60, endMinutes: 2*60 }`
 * means "Friday 22:00 through Saturday 02:00 in the user's timezone".
 */
export const quietScheduleWindowSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(0).max(1439),
  })
  .strict();
export type QuietScheduleWindow = z.infer<typeof quietScheduleWindowSchema>;

export const quietScheduleSchema = z
  .object({
    enabled: z.boolean(),
    windows: z.array(quietScheduleWindowSchema).max(50).default([]),
  })
  .strict();
export type QuietSchedule = z.infer<typeof quietScheduleSchema>;

export const DEFAULT_QUIET_SCHEDULE: QuietSchedule = { enabled: false, windows: [] };

// Nullable ISO datetime (offset required, matches `z.iso.datetime({ offset: true })` behaviour
// used elsewhere in this package's schemas). `null` means "no temporary mute in effect".
export const mutedUntilSchema = z.union([z.null(), z.iso.datetime({ offset: true })]);
export type MutedUntil = z.infer<typeof mutedUntilSchema>;

export type NotificationMuteSettings = {
  timezone: string;
  quietSchedule: QuietSchedule;
  mutedUntil: string | null;
};

export type MuteEvaluation = {
  muted: boolean;
  reason: 'temporary_mute' | 'quiet_schedule' | null;
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

type LocalWallTime = { day: number; minutes: number };

function formatLocalWallTime(instant: Date, timeZone: string): LocalWallTime {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  let weekdayName: string | undefined;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') {
      weekdayName = part.value;
    } else if (part.type === 'hour') {
      hour = Number.parseInt(part.value, 10);
    } else if (part.type === 'minute') {
      minute = Number.parseInt(part.value, 10);
    }
  }

  if (!weekdayName || !(weekdayName in WEEKDAY_TO_INDEX)) {
    throw new Error(`Unable to resolve weekday for timezone ${timeZone}`);
  }
  return { day: WEEKDAY_TO_INDEX[weekdayName]!, minutes: hour * 60 + minute };
}

function matchesWindow(now: LocalWallTime, window: QuietScheduleWindow): boolean {
  // Non-wrapping window: same-day, contains [start, end).
  if (window.endMinutes > window.startMinutes) {
    return now.day === window.day && now.minutes >= window.startMinutes && now.minutes < window.endMinutes;
  }
  // Wrapping window (endMinutes <= startMinutes). Includes:
  //   - same-day tail: current day == window.day AND minutes >= start
  //   - next-day head: current day == (window.day + 1) mod 7 AND minutes < end
  // A window with start === end is treated as "empty" (never matches).
  if (window.startMinutes === window.endMinutes) {
    return false;
  }
  if (now.day === window.day && now.minutes >= window.startMinutes) {
    return true;
  }
  const nextDay = (window.day + 1) % 7;
  if (now.day === nextDay && now.minutes < window.endMinutes) {
    return true;
  }
  return false;
}

/**
 * Pure evaluator. Callers (dispatch handler, /notifications/settings projection) pass the
 * already-loaded per-user mute settings plus a specific instant to evaluate against; no I/O,
 * no wall-clock reads, no environment inspection happens here.
 *
 * Precedence: temporary_mute > quiet_schedule > (not muted).
 *
 * Fail-closed-to-push: any malformed input (unparseable persisted settings, invalid timezone)
 * throws — the caller in the dispatch handler catches and treats a throw as "not muted"
 * (push proceeds; inbox item always persists).
 */
export function isNotificationMutedAt(settings: NotificationMuteSettings, instant: Date): MuteEvaluation {
  // Validate — throws on malformed input, callers catch (fail-open-to-push).
  const timezone = ianaTimezoneSchema.parse(settings.timezone);
  const schedule = quietScheduleSchema.parse(settings.quietSchedule);
  const mutedUntil = mutedUntilSchema.parse(settings.mutedUntil);

  if (mutedUntil !== null) {
    const untilMs = Date.parse(mutedUntil);
    if (!Number.isFinite(untilMs)) {
      throw new Error('mutedUntil is not a parseable ISO datetime');
    }
    if (instant.getTime() < untilMs) {
      return { muted: true, reason: 'temporary_mute' };
    }
  }

  if (schedule.enabled && schedule.windows.length > 0) {
    const local = formatLocalWallTime(instant, timezone);
    for (const window of schedule.windows) {
      if (matchesWindow(local, window)) {
        return { muted: true, reason: 'quiet_schedule' };
      }
    }
  }

  return { muted: false, reason: null };
}
