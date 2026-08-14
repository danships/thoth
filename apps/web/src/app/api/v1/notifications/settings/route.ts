import { apiRoute } from '@/lib/api/route-wrapper';
import { isNotificationMutedAt } from '@thoth/database';
import { getSetting, setSetting } from '@/lib/settings/service';
import {
  NOTIFICATIONS_MUTED_UNTIL_KEY,
  NOTIFICATIONS_QUIET_SCHEDULE_KEY,
  USER_TIMEZONE_KEY,
} from '@/lib/settings/definitions';
import type { NotificationSettingsResponse, PatchNotificationSettingsBody } from '@/types/api';
import { patchNotificationSettingsBodySchema } from '@/types/api';

// Notification quiet-schedule settings + read-only projection of the general timezone plus the
// live mute evaluation result (THOTH-071). Timezone is NOT settable through this endpoint —
// the general `PATCH /user/settings` is the sole writer, and Zod `.strict()` on the body
// schema rejects the field if provided.
async function loadAndEvaluate(userId: string): Promise<NotificationSettingsResponse> {
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
  } catch {
    // Fail-open: never surface an evaluator throw as a 500.
  }
  return { quietSchedule, timezone, isMutedNow, muteReason, mutedUntil };
}

export const GET = apiRoute<NotificationSettingsResponse, {}, {}, {}>(
  { disallowApiKey: true },
  async (_context, session) => loadAndEvaluate(session.user.id)
);

export const PATCH = apiRoute<NotificationSettingsResponse, {}, {}, PatchNotificationSettingsBody>(
  { disallowApiKey: true, expectedBodySchema: patchNotificationSettingsBodySchema },
  async ({ body }, session) => {
    await setSetting(
      NOTIFICATIONS_QUIET_SCHEDULE_KEY,
      { scope: 'user', subjectId: session.user.id },
      body.quietSchedule
    );
    return loadAndEvaluate(session.user.id);
  }
);
