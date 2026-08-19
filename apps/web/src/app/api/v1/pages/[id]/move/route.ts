import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, syncContainerAccessParent, touchContainerAccess } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import {
  resolveMoveCopyDestination,
  destinationSortOrder,
  assertNoMoveCycle,
  toPageResponse,
} from '@/lib/database/page-copy-move-service';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { HttpError } from '@/lib/errors/http-error';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { scheduleNotificationDispatch } from '@/lib/notifications/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import type { MovePageParameters, MovePageBody, MovePageResponse } from '@/types/api';
import { movePageParametersSchema, movePageBodySchema } from '@/types/api';
import type { PageContainer } from '@thoth/database/types';

export const POST = apiRoute<MovePageResponse, {}, MovePageParameters, MovePageBody>(
  { expectedParamsSchema: movePageParametersSchema, expectedBodySchema: movePageBodySchema },
  async ({ params, body }, session) => {
    const source = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, source, { mutating: true });
    if (source.parentId !== body.expectedParentId && source.parentId !== body.parentId)
      throw new HttpError('Page was moved elsewhere', 409, true);
    await resolveMoveCopyDestination(session, source, body.parentId);
    try {
      await assertNoMoveCycle(source, body.parentId);
    } catch {
      throw new BadRequestError('A page cannot be moved into itself or one of its sub-pages');
    }
    const now = new Date().toISOString();
    let moved: PageContainer = source;
    if (source.parentId !== body.parentId) {
      const updated = await (
        await getContainerRepository()
      ).update({
        ...source,
        parentId: body.parentId,
        sortOrder: await destinationSortOrder(source.workspaceId, body.parentId),
        lastUpdated: now,
      });
      if (updated.type !== 'page') throw new Error('Moved a non-page container');
      moved = updated;
    }
    await syncContainerAccessParent(moved);
    await touchContainerAccess(moved, session.user.id, now);
    scheduleNotifyPageChange('page.updated', moved, toWebhookActor(session));
    scheduleNotificationDispatch('page.updated', moved, toWebhookActor(session));
    return { page: toPageResponse(moved) };
  }
);
