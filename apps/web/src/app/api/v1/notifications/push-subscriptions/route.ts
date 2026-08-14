import { apiRoute } from '@/lib/api/route-wrapper';
import { upsertPushSubscriptionByEndpoint } from '@thoth/database';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import type { RegisterPushSubscriptionBody, RegisterPushSubscriptionResponse } from '@/types/api';
import { registerPushSubscriptionBodySchema } from '@/types/api';

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
      throw new BadRequestError(error instanceof Error ? error.message : 'Failed to register subscription');
    }
  }
);
