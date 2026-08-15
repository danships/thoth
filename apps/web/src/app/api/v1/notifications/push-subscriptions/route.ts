import { apiRoute } from '@/lib/api/route-wrapper';
import { upsertPushSubscriptionByEndpoint } from '@thoth/database';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import type { RegisterPushSubscriptionBody, RegisterPushSubscriptionResponse } from '@/types/api';
import { registerPushSubscriptionBodySchema } from '@/types/api';

// Matches the exact throw message from `upsertPushSubscriptionByEndpoint`
// (`packages/database/src/push-subscription-service.ts`) — the only caller-caused failure it
// can produce. Everything else is a server fault and must propagate as a 500.
const ENDPOINT_OWNED_BY_OTHER_ACCOUNT = 'push-subscription endpoint belongs to a different account';

// Register (or take over) a browser Push subscription (THOTH-071). The client sends the exact
// `PushSubscription.toJSON()` shape returned by `PushManager.subscribe()`. Response returns
// ONLY the internal id + createdAt — endpoint/keys are never echoed back after registration
// (they're the payload-encryption secret).
export const POST = apiRoute<RegisterPushSubscriptionResponse, {}, {}, RegisterPushSubscriptionBody>(
  { disallowApiKey: true, expectedBodySchema: registerPushSubscriptionBodySchema },
  async ({ body }, session) => {
    try {
      const row = await upsertPushSubscriptionByEndpoint({
        userId: session.user.id,
        endpoint: body.endpoint,
        expirationTime: body.expirationTime,
        keys: body.keys,
        userAgentLabel: body.userAgentLabel ?? null,
      });
      return { id: row.id, createdAt: row.createdAt };
    } catch (error) {
      // Cross-account claim without matching keys — 400, existence-hiding for the true owner.
      if (error instanceof Error && error.message === ENDPOINT_OWNED_BY_OTHER_ACCOUNT) {
        throw new BadRequestError('Invalid subscription');
      }
      // Anything else is a server fault; let the wrapper report 500 so it stays observable.
      throw error;
    }
  }
);
