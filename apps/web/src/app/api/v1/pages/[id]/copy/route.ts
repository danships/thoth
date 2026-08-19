import { apiRoute } from '@/lib/api/route-wrapper';
import { createContentBaseline, getContainerRepository, registerContainerAccessForNewPage } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import {
  resolveMoveCopyDestination,
  destinationSortOrder,
  toPageResponse,
} from '@/lib/database/page-copy-move-service';
import { extractFileIdsFromContent, syncFileUsageForPage } from '@/lib/files/usage';
import { getLogger } from '@/lib/logger';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { scheduleNotificationDispatch } from '@/lib/notifications/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import type { PageContainer } from '@thoth/database/types';
import type { CopyPageParameters, CopyPageBody, CopyPageResponse } from '@/types/api';
import { copyPageParametersSchema, copyPageBodySchema } from '@/types/api';

export const POST = apiRoute<CopyPageResponse, {}, CopyPageParameters, CopyPageBody>(
  { expectedParamsSchema: copyPageParametersSchema, expectedBodySchema: copyPageBodySchema },
  async ({ params, body, setResponseStatus }, session) => {
    const source = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, source);
    const parent = await resolveMoveCopyDestination(session, source, body.parentId);
    const now = new Date().toISOString();
    const repository = await getContainerRepository();
    const copiedPageData: Omit<PageContainer, 'id'> = {
      name: `${source.name} (copy)`,
      emoji: source.emoji ?? null,
      cover: source.cover ?? null,
      content: source.content ?? '',
      type: 'page' as const,
      parentId: body.parentId,
      workspaceId: source.workspaceId,
      userId: session.user.id,
      createdAt: now,
      lastUpdated: now,
      deletedAt: null,
      deletedRootId: null,
      sortOrder: await destinationSortOrder(source.workspaceId, body.parentId),
      isPrivate: parent?.isPrivate ?? false,
      privateRootId: parent?.isPrivate ? (parent.privateRootId ?? parent.id) : null,
    };
    const copiedContainer = await repository.create(copiedPageData);
    if (copiedContainer.type !== 'page') throw new Error('Created a non-page container');
    const copied: PageContainer = copiedContainer;
    await registerContainerAccessForNewPage(copied, session.user.id);
    await createContentBaseline({ page: copied, content: copied.content ?? '', author: session.user.id });
    try {
      await syncFileUsageForPage(copied.id, session, extractFileIdsFromContent(copied.content ?? ''));
    } catch {
      const logger = await getLogger();
      logger.warn('page.copy.sync-file-usage-failed', { pageId: copied.id });
    }
    scheduleNotifyPageChange('page.created', copied, toWebhookActor(session));
    scheduleNotificationDispatch('page.created', copied, toWebhookActor(session));
    setResponseStatus(201);
    return { page: toPageResponse(copied) };
  }
);
