// A curated fallback list of common IANA timezone identifiers, used only when the runtime
// doesn't implement `Intl.supportedValuesOf` (older browsers). Every modern evergreen browser
// and Node 18+ supports it, so this path is rarely hit in practice.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

// Returns every IANA timezone identifier the current runtime knows about, for use in a
// searchable `Select`. `Intl.supportedValuesOf` is the canonical, dependency-free source (no
// need to bundle a tz database) — see `packages/database/src/notifications/mute.ts` for the
// matching server-side validation, which relies on the same `Intl` machinery.
export function listIanaTimezones(): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return FALLBACK_TIMEZONES;
    }
  }
  return FALLBACK_TIMEZONES;
}

// Best-effort guess of the browser's own timezone, used only to pre-select a sensible default
// the first time a user opens the settings screen (never auto-saved).
export function detectBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
