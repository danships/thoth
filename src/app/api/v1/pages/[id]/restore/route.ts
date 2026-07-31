import { apiRoute } from '@/lib/api/route-wrapper';
import { restoreByDeletedRootId } from '@/lib/database/soft-delete-service';
import { getPageDeleteGracePeriodDays } from '@/lib/database/page-grace-period';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { HttpError } from '@/lib/errors/http-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getLogger } from '@/lib/logger';
import type { RestorePageParameters, RestorePageResponse } from '@/types/api';
import { restorePageParametersSchema } from '@/types/api';

export const POST = apiRoute<RestorePageResponse, undefined, RestorePageParameters, {}>(
  {
    expectedParamsSchema: restorePageParametersSchema,
  },
  async ({ params }, session) => {
    const page = await pageRetriever.retrievePageIncludingDeleted(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    if (!page.deletedAt || page.deletedRootId !== page.id) {
      throw new NotFoundError('Page not found');
    }

    const gracePeriodDays = await getPageDeleteGracePeriodDays();
    const deletedAtMs = Date.parse(page.deletedAt);
    const graceThresholdMs = Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000;
    if (Number.isNaN(deletedAtMs) || deletedAtMs <= graceThresholdMs) {
      throw new HttpError('Grace period has expired for this page', 410, true);
    }

    await restoreByDeletedRootId(page.id, session.user.id, page.workspaceId);
    const restored = await pageRetriever.retrievePage(page.id, session.user.id);

    const logger = await getLogger();
    logger.info('page.restore', {
      actorUserId: session.user.id,
      pageId: restored.id,
      workspaceId: restored.workspaceId,
    });

    return {
      id: restored.id,
      name: restored.name,
      emoji: restored.emoji || null,
      cover: restored.cover ?? null,
      parentId: restored.parentId || null,
      createdAt: restored.createdAt,
      lastUpdated: restored.lastUpdated,
    };
  }
);
