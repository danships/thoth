import { isNotificationMutedAt } from '@thoth/database';
import { getSetting } from '@/lib/settings/service';
import { getLogger } from '@/lib/logger';
import {
  NOTIFICATIONS_MUTED_UNTIL_KEY,
  NOTIFICATIONS_QUIET_SCHEDULE_KEY,
  USER_TIMEZONE_KEY,
} from '@/lib/settings/definitions';
import type { NotificationSettingsResponse } from '@/types/api';

/**
 * Load the persisted quiet-schedule/mute settings for `userId` and evaluate them against "now"
 * (THOTH-071). Shared by `GET/PATCH /notifications/settings` and `POST/DELETE /notifications/mute`
 * so the fail-open evaluation rule (and the fact that a throw is logged, not silently hidden)
 * lives in exactly one place.
 *
 * `isNotificationMutedAt` only throws for a malformed persisted timezone/quiet-schedule/
 * `mutedUntil` value — a real configuration fault, not an expected condition — so we fail open
 * (report not-muted) but log at `warn` with the userId and error so the fault is visible.
 */
export async function loadAndEvaluateNotificationMuteState(userId: string): Promise<NotificationSettingsResponse> {
  const [timezone, quietSchedule, mutedUntil] = await Promise.all([
    getSetting(USER_TIMEZONE_KEY, { scope: 'user', subjectId: userId }),
    getSetting(NOTIFICATIONS_QUIET_SCHEDULE_KEY, { scope: 'user', subjectId: userId }),
    getSetting(NOTIFICATIONS_MUTED_UNTIL_KEY, { scope: 'user', subjectId: userId }),
  ]);
  let isMutedNow = false;
  let muteReason: NotificationSettingsResponse['muteReason'] = null;
  try {
    const evaluation = isNotificationMutedAt({ timezone, quietSchedule, mutedUntil }, new Date());
    isMutedNow = evaluation.muted;
    muteReason = evaluation.reason;
  } catch (error) {
    // Fail-open: never surface an evaluator throw as a 500, but do not hide it either.
    const logger = await getLogger();
    logger.warn('notifications.mute-eval-failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { quietSchedule, timezone, isMutedNow, muteReason, mutedUntil };
}
