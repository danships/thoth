import { getContainerRepository } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import { scheduleNotificationDispatch } from '@/lib/notifications/notify-service';
import { schedulePageSearchSync } from '@/lib/search/notify-service';
import { extractFileIdsFromContent, syncFileUsageForPage } from '@/lib/files/usage';
import { getLogger } from '@/lib/logger';
import type { ApiKeySession } from '@/lib/auth/session';
import type { MutatePageContentResponse } from '@/types/api';

export type MutatePageContentMode = 'append' | 'prepend';

/**
 * Shared implementation behind `POST /pages/:id/append` and `POST /pages/:id/prepend`. Retrieves
 * the page (scoped to the user + the caller's App grant, if any), concatenates `incoming` onto
 * the existing markdown `content` and persists the result, bumping `lastUpdated` the same way
 * the `PATCH /pages/:id` handler does (deliberately unlike the plain `POST /pages/:id/content`
 * setter, which leaves `lastUpdated` untouched since it doesn't necessarily represent a genuine
 * content change).
 *
 * Concatenation is a simple in-memory read-modify-write via `containerRepository.update` — like
 * the existing `set-page-content` route, there is no optimistic locking, so concurrent
 * append/prepend calls against the same page could still race at the document level. This is an
 * accepted limitation (see THOTH-032 spec); it still massively reduces the race window compared
 * to a client-side GET -> concat -> PUT round trip.
 */
export async function mutatePageContent(
  id: string,
  session: ApiKeySession,
  incoming: string,
  mode: MutatePageContentMode
): Promise<MutatePageContentResponse> {
  const containerRepository = await getContainerRepository();

  const page = await pageRetriever.retrievePage(id, session.user.id);
  await assertGrantAllowsContainerForSession(session, page, { mutating: true });

  const existing = 'content' in page ? (page.content ?? '') : '';

  let content: string;
  if (!existing) {
    content = incoming;
  } else if (!incoming) {
    content = existing;
  } else if (mode === 'append') {
    content = `${existing}\n${incoming}`;
  } else {
    content = `${incoming}\n${existing}`;
  }

  const updatedPage = await containerRepository.update({
    ...page,
    content,
    lastUpdated: new Date().toISOString(),
  });

  // Reconcile `file-usage` rows for every append/prepend, same as `POST /pages/:id/content` —
  // otherwise files referenced only via append/prepend would never gain a usage row and could be
  // incorrectly purged as orphans. Failure here shouldn't roll back or fail the already-persisted
  // content change; log and continue so the save and notification still succeed.
  try {
    await syncFileUsageForPage(id, session, extractFileIdsFromContent(content));
  } catch (error) {
    const logger = await getLogger();
    logger.error('pages.mutate-content.sync-file-usage-failed', { pageId: id, error });
  }

  scheduleNotifyPageChange('page.updated', updatedPage, toWebhookActor(session));
  scheduleNotificationDispatch('page.updated', updatedPage, toWebhookActor(session));
  schedulePageSearchSync(updatedPage);

  return {
    content: 'content' in updatedPage ? (updatedPage.content ?? '') : '',
  };
}
