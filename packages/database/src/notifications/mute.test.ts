import { describe, test, expect } from 'vitest';
import {
  isNotificationMutedAt,
  DEFAULT_QUIET_SCHEDULE,
  quietScheduleSchema,
  ianaTimezoneSchema,
  mutedUntilSchema,
  type NotificationMuteSettings,
} from './mute.js';

describe('ianaTimezoneSchema', () => {
  test('accepts valid IANA zones', () => {
    expect(ianaTimezoneSchema.parse('UTC')).toBe('UTC');
    expect(ianaTimezoneSchema.parse('Europe/Amsterdam')).toBe('Europe/Amsterdam');
    expect(ianaTimezoneSchema.parse('America/Los_Angeles')).toBe('America/Los_Angeles');
  });
  test('rejects garbage', () => {
    expect(() => ianaTimezoneSchema.parse('Not/A_Zone')).toThrow();
    expect(() => ianaTimezoneSchema.parse('')).toThrow();
  });
});

describe('quietScheduleSchema', () => {
  test('parses default', () => {
    expect(quietScheduleSchema.parse({ enabled: false, windows: [] })).toEqual({ enabled: false, windows: [] });
  });
  test('rejects strict-mode extras', () => {
    expect(() => quietScheduleSchema.parse({ enabled: false, windows: [], nope: 1 })).toThrow();
  });
  test('rejects out-of-range windows', () => {
    expect(() => quietScheduleSchema.parse({ enabled: true, windows: [{ day: 7, startMinutes: 0, endMinutes: 1 }] })).toThrow();
    expect(() => quietScheduleSchema.parse({ enabled: true, windows: [{ day: 0, startMinutes: -1, endMinutes: 1 }] })).toThrow();
    expect(() => quietScheduleSchema.parse({ enabled: true, windows: [{ day: 0, startMinutes: 0, endMinutes: 1440 }] })).toThrow();
  });
});

describe('mutedUntilSchema', () => {
  test('accepts null and ISO with offset', () => {
    expect(mutedUntilSchema.parse(null)).toBeNull();
    expect(mutedUntilSchema.parse('2030-01-01T00:00:00.000Z')).toBe('2030-01-01T00:00:00.000Z');
  });
  test('rejects garbage', () => {
    expect(() => mutedUntilSchema.parse('nope')).toThrow();
  });
});

describe('isNotificationMutedAt', () => {
  const baseSettings = (overrides: Partial<NotificationMuteSettings> = {}): NotificationMuteSettings => ({
    timezone: 'UTC',
    quietSchedule: DEFAULT_QUIET_SCHEDULE,
    mutedUntil: null,
    ...overrides,
  });

  test('not muted with defaults', () => {
    expect(isNotificationMutedAt(baseSettings(), new Date('2024-06-15T12:00:00Z'))).toEqual({
      muted: false,
      reason: null,
    });
  });

  test('temporary_mute wins over quiet_schedule', () => {
    const settings = baseSettings({
      mutedUntil: '2030-01-01T00:00:00.000Z',
      quietSchedule: { enabled: true, windows: [{ day: 0, startMinutes: 0, endMinutes: 1439 }] },
    });
    const result = isNotificationMutedAt(settings, new Date('2024-06-15T12:00:00Z'));
    expect(result).toEqual({ muted: true, reason: 'temporary_mute' });
  });

  test('temporary_mute expires', () => {
    const settings = baseSettings({ mutedUntil: '2020-01-01T00:00:00.000Z' });
    expect(isNotificationMutedAt(settings, new Date('2024-06-15T12:00:00Z'))).toEqual({
      muted: false,
      reason: null,
    });
  });

  test('same-day quiet window matches', () => {
    // Saturday (day 6) at 10:30 UTC.
    const instant = new Date('2024-06-15T10:30:00Z');
    const settings = baseSettings({
      quietSchedule: { enabled: true, windows: [{ day: 6, startMinutes: 600, endMinutes: 720 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: true, reason: 'quiet_schedule' });
  });

  test('cross-midnight window matches the next-day head', () => {
    // Friday 22:00 -> Saturday 02:00. Instant is Saturday 01:30 UTC.
    const instant = new Date('2024-06-15T01:30:00Z');
    const settings = baseSettings({
      quietSchedule: { enabled: true, windows: [{ day: 5, startMinutes: 22 * 60, endMinutes: 2 * 60 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: true, reason: 'quiet_schedule' });
  });

  test('cross-midnight window matches its same-day tail', () => {
    // Same window as above, instant is Friday 23:00 UTC.
    const instant = new Date('2024-06-14T23:00:00Z');
    const settings = baseSettings({
      quietSchedule: { enabled: true, windows: [{ day: 5, startMinutes: 22 * 60, endMinutes: 2 * 60 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: true, reason: 'quiet_schedule' });
  });

  test('Sunday boundary (day 0)', () => {
    // Sunday 08:00 UTC.
    const instant = new Date('2024-06-16T08:00:00Z');
    const settings = baseSettings({
      quietSchedule: { enabled: true, windows: [{ day: 0, startMinutes: 7 * 60, endMinutes: 9 * 60 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: true, reason: 'quiet_schedule' });
  });

  test('respects user timezone', () => {
    // 2024-06-15T09:00:00Z is 11:00 in Europe/Amsterdam (UTC+2 in June).
    // A 10:00-12:00 Saturday window in local Amsterdam time should match this instant.
    const instant = new Date('2024-06-15T09:00:00Z');
    const settings = baseSettings({
      timezone: 'Europe/Amsterdam',
      quietSchedule: { enabled: true, windows: [{ day: 6, startMinutes: 10 * 60, endMinutes: 12 * 60 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: true, reason: 'quiet_schedule' });
  });

  test('window ends exclusive', () => {
    const instant = new Date('2024-06-15T12:00:00Z');
    const settings = baseSettings({
      quietSchedule: { enabled: true, windows: [{ day: 6, startMinutes: 600, endMinutes: 720 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: false, reason: null });
  });

  test('disabled schedule never mutes', () => {
    const instant = new Date('2024-06-15T10:30:00Z');
    const settings = baseSettings({
      quietSchedule: { enabled: false, windows: [{ day: 6, startMinutes: 0, endMinutes: 1439 }] },
    });
    expect(isNotificationMutedAt(settings, instant)).toEqual({ muted: false, reason: null });
  });

  test('malformed timezone throws (caller catches → fails open to push)', () => {
    const settings: NotificationMuteSettings = {
      timezone: 'Not/A_Zone',
      quietSchedule: DEFAULT_QUIET_SCHEDULE,
      mutedUntil: null,
    };
    expect(() => isNotificationMutedAt(settings, new Date())).toThrow();
  });

  test('injected clock is respected', () => {
    const settings = baseSettings({ mutedUntil: '2030-01-01T00:00:00.000Z' });
    // Before the until instant → muted.
    expect(isNotificationMutedAt(settings, new Date('2029-12-31T23:59:00Z')).muted).toBe(true);
    // After → not muted.
    expect(isNotificationMutedAt(settings, new Date('2030-01-01T00:00:01Z')).muted).toBe(false);
  });
});
