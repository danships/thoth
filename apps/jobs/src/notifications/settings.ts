import { getSettingRepository } from '@thoth/database';
import type { Setting } from '@thoth/database';
import {
  DEFAULT_QUIET_SCHEDULE,
  ianaTimezoneSchema,
  quietScheduleSchema,
  mutedUntilSchema,
  USER_TIMEZONE_SETTING_KEY,
  NOTIFICATIONS_QUIET_SCHEDULE_SETTING_KEY,
  NOTIFICATIONS_MUTED_UNTIL_SETTING_KEY,
  type NotificationMuteSettings,
  type QuietSchedule,
} from '@thoth/database';

/**
 * Jobs-side settings reader (THOTH-071). `apps/jobs` can't import `apps/web/src/lib/settings`,
 * so this file re-implements the minimum needed slice: read the three per-user keys, apply the
 * same canonical-row selection as `apps/web/src/lib/settings/service.ts#selectCanonical`, parse
 * the value with the shared schemas, and fall back to registered defaults.
 */

// User-scope key names — imported from `@thoth/database/notifications/mute`, the single source
// of truth for these persisted `Setting` key strings, also used by
// `apps/web/src/lib/settings/definitions.ts`. Keeping one definition means a rename can never
// silently desync the two apps' mute evaluation.
const USER_TIMEZONE_KEY = USER_TIMEZONE_SETTING_KEY;
const NOTIFICATIONS_QUIET_SCHEDULE_KEY = NOTIFICATIONS_QUIET_SCHEDULE_SETTING_KEY;
const NOTIFICATIONS_MUTED_UNTIL_KEY = NOTIFICATIONS_MUTED_UNTIL_SETTING_KEY;

function selectCanonical(rows: Setting[]): Setting | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => {
    if (a.lastUpdated !== b.lastUpdated) return a.lastUpdated < b.lastUpdated ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

async function readUserSetting<T>(
  userId: string,
  key: string,
  parse: (raw: unknown) => T,
  fallback: T
): Promise<T> {
  const repository = await getSettingRepository();
  const rows = await repository.getByQuery(
    repository.createQuery().eq('scope', 'user').eq('subjectId', userId).eq('key', key)
  );
  const canonical = selectCanonical(rows);
  if (!canonical) return fallback;
  try {
    return parse(JSON.parse(canonical.value));
  } catch {
    return fallback;
  }
}

/**
 * Read the (timezone, quietSchedule, mutedUntil) triple for `userId`. Missing/malformed rows
 * resolve to the registered defaults (timezone: `'UTC'`, quiet-schedule disabled/empty,
 * `mutedUntil: null`) — the pure evaluator (`isNotificationMutedAt`) still validates the final
 * combined value and will throw on garbage, which the dispatch handler catches (fail open).
 */
export async function readNotificationMuteSettingsForUser(userId: string): Promise<NotificationMuteSettings> {
  const timezone = await readUserSetting<string>(
    userId,
    USER_TIMEZONE_KEY,
    (value) => ianaTimezoneSchema.parse(value),
    'UTC'
  );
  const quietSchedule = await readUserSetting<QuietSchedule>(
    userId,
    NOTIFICATIONS_QUIET_SCHEDULE_KEY,
    (value) => quietScheduleSchema.parse(value),
    DEFAULT_QUIET_SCHEDULE
  );
  const mutedUntil = await readUserSetting<string | null>(
    userId,
    NOTIFICATIONS_MUTED_UNTIL_KEY,
    (value) => mutedUntilSchema.parse(value),
    null
  );
  return { timezone, quietSchedule, mutedUntil };
}
