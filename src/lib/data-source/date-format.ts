/**
 * Date format helpers for date column type.
 *
 * Convention: dates are always stored as full ISO 8601 strings (UTC).
 * Native inputs (date/time/datetime-local) are timezone-naive; we interpret
 * them as local time and convert to/from UTC ISO when reading/writing.
 *
 * For `time` mode, today's date is used as the reference date so that a valid
 * full ISO string can be formed; only the time portion is displayed.
 */

import type { DateMode } from '@/types/schemas/entities/container';

// ─── Format presets ───────────────────────────────────────────────────────────

export type DateFormatPreset = { value: string; label: string };

export const DATE_PRESETS: DateFormatPreset[] = [
  { value: 'DD MMM YYYY', label: '31 Jan 2026' },
  { value: 'YYYY-MM-DD', label: '2026-01-31' },
  { value: 'MM/DD/YYYY', label: '01/31/2026' },
  { value: 'MMM DD, YYYY', label: 'Jan 31, 2026' },
];

export const TIME_PRESETS: DateFormatPreset[] = [
  { value: 'HH:mm', label: '14:30' },
  { value: 'h:mm A', label: '2:30 PM' },
];

export const DATETIME_PRESETS: DateFormatPreset[] = [
  { value: 'DD MMM YYYY HH:mm', label: '31 Jan 2026 14:30' },
  { value: 'YYYY-MM-DD HH:mm', label: '2026-01-31 14:30' },
  { value: 'MM/DD/YYYY h:mm A', label: '01/31/2026 2:30 PM' },
  { value: 'MMM DD, YYYY h:mm A', label: 'Jan 31, 2026 2:30 PM' },
];

export function getPresetsForMode(mode: DateMode): DateFormatPreset[] {
  if (mode === 'date') return DATE_PRESETS;
  if (mode === 'time') return TIME_PRESETS;
  return DATETIME_PRESETS;
}

export function getDefaultFormatForMode(mode: DateMode): string {
  return getPresetsForMode(mode)[0]?.value ?? '';
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a full ISO string stored in the DB to the value expected by a native
 * HTML input (YYYY-MM-DD, HH:mm, or YYYY-MM-DDTHH:mm).
 */
export function toInputValue(iso: string, mode: DateMode): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';

    if (mode === 'date') {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    if (mode === 'time') {
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${min}`;
    }

    // datetime-local: YYYY-MM-DDTHH:mm
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}:${min}`;
  } catch {
    return '';
  }
}

/**
 * Convert a native input value back to a full ISO string.
 * For `time` mode, today's date is used as the reference.
 */
export function toIsoFromInput(inputValue: string, mode: DateMode): string {
  if (!inputValue) return '';
  try {
    let d: Date;
    if (mode === 'time') {
      const parts = inputValue.split(':').map(Number);
      const hours = parts[0] ?? 0;
      const minutes = parts[1] ?? 0;
      d = new Date();
      d.setHours(hours, minutes, 0, 0);
    } else {
      d = new Date(inputValue);
    }
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch {
    return '';
  }
}

// ─── Display formatter ────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function to12Hour(h: number): { hour: number; ampm: string } {
  return h < 12 ? { hour: h === 0 ? 12 : h, ampm: 'AM' } : { hour: h === 12 ? 12 : h - 12, ampm: 'PM' };
}

/**
 * Format a stored ISO string for display using one of the preset format tokens.
 */
export function formatDateValue(iso: string, format: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;

    const y = d.getFullYear();
    const mo = d.getMonth();
    const day = d.getDate();
    const h = d.getHours();
    const min = d.getMinutes();
    const { hour: h12, ampm } = to12Hour(h);

    return format
      .replace('YYYY', String(y))
      .replace('MM', pad(mo + 1))
      .replace('MMM', MONTH_SHORT[mo] ?? '')
      .replace('DD', pad(day))
      .replace('HH', pad(h))
      .replace('h', String(h12))
      .replace('mm', pad(min))
      .replace('A', ampm);
  } catch {
    return iso;
  }
}
