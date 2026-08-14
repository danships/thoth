import { apiRoute } from '@/lib/api/route-wrapper';
import { setSetting } from '@/lib/settings/service';
import { NOTIFICATIONS_QUIET_SCHEDULE_KEY } from '@/lib/settings/definitions';
import { loadAndEvaluateNotificationMuteState } from '@/lib/notifications/mute-state';
import type { NotificationSettingsResponse, PatchNotificationSettingsBody } from '@/types/api';
import { patchNotificationSettingsBodySchema } from '@/types/api';

// Notification quiet-schedule settings + read-only projection of the general timezone plus the
// live mute evaluation result (THOTH-071). Timezone is NOT settable through this endpoint —
// the general `PATCH /user/settings` is the sole writer, and Zod `.strict()` on the body
// schema rejects the field if provided.
export const GET = apiRoute<NotificationSettingsResponse, {}, {}, {}>(
  { disallowApiKey: true },
  async (_context, session) => loadAndEvaluateNotificationMuteState(session.user.id)
);

export const PATCH = apiRoute<NotificationSettingsResponse, {}, {}, PatchNotificationSettingsBody>(
  { disallowApiKey: true, expectedBodySchema: patchNotificationSettingsBodySchema },
  async ({ body }, session) => {
    await setSetting(
      NOTIFICATIONS_QUIET_SCHEDULE_KEY,
      { scope: 'user', subjectId: session.user.id },
      body.quietSchedule
    );
    return loadAndEvaluateNotificationMuteState(session.user.id);
  }
);
