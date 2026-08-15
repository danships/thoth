import { apiRoute } from '@/lib/api/route-wrapper';
import { getSetting, setSetting } from '@/lib/settings/service';
import { USER_TIMEZONE_KEY } from '@/lib/settings/definitions';
import type { GetUserSettingsResponse, PatchUserSettingsBody, PatchUserSettingsResponse } from '@/types/api';
import { patchUserSettingsBodySchema } from '@/types/api';

// Cross-workspace per-user general settings (THOTH-071). Today only `timezone` — used both as
// the display timezone across the app and as the quiet-schedule evaluator's zone.
export const GET = apiRoute<GetUserSettingsResponse, {}, {}, {}>(
  { disallowApiKey: true },
  async (_context, session) => {
    const timezone = await getSetting(USER_TIMEZONE_KEY, { scope: 'user', subjectId: session.user.id });
    return { timezone };
  }
);

export const PATCH = apiRoute<PatchUserSettingsResponse, {}, {}, PatchUserSettingsBody>(
  { disallowApiKey: true, expectedBodySchema: patchUserSettingsBodySchema },
  async ({ body }, session) => {
    await setSetting(USER_TIMEZONE_KEY, { scope: 'user', subjectId: session.user.id }, body.timezone);
    return { timezone: body.timezone };
  }
);
