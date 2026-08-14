import { apiRoute } from '@/lib/api/route-wrapper';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { setSetting, deleteSetting } from '@/lib/settings/service';
import { NOTIFICATIONS_MUTED_UNTIL_KEY } from '@/lib/settings/definitions';
import { loadAndEvaluateNotificationMuteState } from '@/lib/notifications/mute-state';
import type { NotificationMuteResponse, PostNotificationMuteBody } from '@/types/api';
import { postNotificationMuteBodySchema } from '@/types/api';

const PRESET_TO_MS: Record<'1h' | '2h' | '1d', number> = {
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

async function currentState(userId: string): Promise<NotificationMuteResponse> {
  const { mutedUntil, isMutedNow, muteReason } = await loadAndEvaluateNotificationMuteState(userId);
  return { mutedUntil, isMutedNow, muteReason };
}

// Set a temporary mute. Body is EITHER `{ preset: '1h' | '2h' | '1d' }` or `{ until: ISO }`.
// Zod's union enforces "exactly one".
export const POST = apiRoute<NotificationMuteResponse, {}, {}, PostNotificationMuteBody>(
  { disallowApiKey: true, expectedBodySchema: postNotificationMuteBodySchema },
  async ({ body }, session) => {
    let untilInstant: number;
    if ('preset' in body) {
      untilInstant = Date.now() + PRESET_TO_MS[body.preset];
    } else {
      untilInstant = Date.parse(body.until);
      if (!Number.isFinite(untilInstant)) {
        throw new BadRequestError('Invalid until instant');
      }
    }
    const now = Date.now();
    if (untilInstant <= now) {
      throw new BadRequestError('Mute end must be in the future');
    }
    if (untilInstant - now > MAX_FUTURE_MS) {
      throw new BadRequestError('Mute end must be within 1 year of now');
    }
    const value = new Date(untilInstant).toISOString();
    await setSetting(NOTIFICATIONS_MUTED_UNTIL_KEY, { scope: 'user', subjectId: session.user.id }, value);
    return currentState(session.user.id);
  }
);

// Clear the temporary mute (idempotent).
export const DELETE = apiRoute<NotificationMuteResponse, {}, {}, {}>(
  { disallowApiKey: true },
  async (_context, session) => {
    await deleteSetting(NOTIFICATIONS_MUTED_UNTIL_KEY, { scope: 'user', subjectId: session.user.id });
    return currentState(session.user.id);
  }
);
