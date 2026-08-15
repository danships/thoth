import { apiRoute } from '@/lib/api/route-wrapper';
import { disablePushSubscriptionForUser } from '@thoth/database';
import type { DeletePushSubscriptionParameters, DeletePushSubscriptionResponse } from '@/types/api';
import { deletePushSubscriptionParametersSchema } from '@/types/api';

// Explicitly disable a Push subscription owned by the caller (THOTH-071). Sets `disabledAt`
// even if the client-side `unsubscribe()` half failed — idempotent. Responds 404 for
// non-owners/missing rows (existence-hiding).
export const DELETE = apiRoute<DeletePushSubscriptionResponse, {}, DeletePushSubscriptionParameters, {}>(
  { disallowApiKey: true, expectedParamsSchema: deletePushSubscriptionParametersSchema },
  async ({ params }, session) => {
    const updated = await disablePushSubscriptionForUser(params.id, session.user.id);
    if (!updated) {
      const { NotFoundError } = await import('@/lib/errors/not-found-error');
      throw new NotFoundError('Push subscription not found');
    }
    return { id: params.id };
  }
);
