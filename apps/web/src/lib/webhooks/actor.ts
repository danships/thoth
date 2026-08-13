import type { WebhookActor } from '@thoth/job-protocol';
import type { ApiKeySession } from '@/lib/auth/session';

/**
 * Builds the explicit `WebhookActor` union (THOTH-061) from the resolved session: an App-bearer
 * session (`session.appContext`) becomes `{ type: 'app', appId, userId }` (the attributed user
 * id, needed so `suppressOwnChanges` still matches correctly), and a human cookie session
 * becomes `{ type: 'user', userId }`. Used by every page-mutation route before scheduling a
 * `webhook.dispatch` job.
 */
export function toWebhookActor(session: ApiKeySession): WebhookActor {
  if (session.appContext) {
    return { type: 'app', appId: session.appContext.appId, userId: session.user.id };
  }
  return { type: 'user', userId: session.user.id };
}
