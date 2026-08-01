import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getPageRevisionRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { registerContainerAccessForNewPage } from '@/lib/database/container-access-service';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { reconstructAt, reconstructValuesAt } from '@/lib/history/reconstruct';
import { createContentBaseline } from '@/lib/history/revision-service';
import type { PageRevision, PageContainer } from '@/types/database';
import {
  forkPageRevisionBodySchema,
  forkPageRevisionParametersSchema,
  type ForkPageRevisionBody,
  type ForkPageRevisionParameters,
  type ForkPageRevisionResponse,
} from '@/types/api/endpoints/fork-page-revision';

// The highest sequence in `revisions` whose `createdAt` is at or before `atOrBefore` — used to
// find the state of the *other* stream (content vs values) as of a chosen revision's timestamp,
// since fork reconstructs both streams from a single point in time. Returns 0 (meaning "before
// any revision") if nothing qualifies.
function sequenceAtOrBefore(
  revisions: readonly Pick<PageRevision, 'sequence' | 'createdAt'>[],
  atOrBefore: string
): number {
  let best = 0;
  for (const revision of revisions) {
    if (revision.createdAt <= atOrBefore && revision.sequence > best) {
      best = revision.sequence;
    }
  }
  return best;
}

export const POST = apiRoute<ForkPageRevisionResponse, undefined, ForkPageRevisionParameters, ForkPageRevisionBody>(
  {
    expectedParamsSchema: forkPageRevisionParametersSchema,
    expectedBodySchema: forkPageRevisionBodySchema,
  },
  async ({ params, body }, session) => {
    const containerRepository = await getContainerRepository();
    const sourcePage = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, sourcePage);

    const repository = await getPageRevisionRepository();
    const revision = await repository.getOneByQuery(
      addUserIdToQuery(repository.createQuery().eq('id', params.revisionId), session.user.id)
    );
    if (!revision || revision.containerId !== params.id) {
      throw new NotFoundError('Revision not found', true);
    }

    let workspaceId: string;
    let parentId: string | null = null;

    if (body?.parentId) {
      const parentContainer = await containerRepository.getOneByQuery(
        containerRepository.createQuery().eq('id', body.parentId)
      );
      if (
        !parentContainer ||
        parentContainer.deletedAt ||
        (parentContainer.type !== 'page' && parentContainer.type !== 'data-source')
      ) {
        throw new BadRequestError('Parent page not found or access denied');
      }
      await assertWorkspaceAccess(session.user.id, parentContainer.workspaceId);
      workspaceId = parentContainer.workspaceId;
      parentId = body.parentId;
    } else {
      workspaceId = sourcePage.workspaceId;
      await assertWorkspaceAccess(session.user.id, workspaceId);
    }

    const contentRevisions = await repository.getByQuery(
      addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
        .eq('target', 'content')
        .sort('sequence', 'asc')
    );
    const valuesRevisions = await repository.getByQuery(
      addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
        .eq('target', 'values')
        .sort('sequence', 'asc')
    );

    const contentTargetSeq =
      revision.target === 'content' ? revision.sequence : sequenceAtOrBefore(contentRevisions, revision.createdAt);
    const valuesTargetSeq =
      revision.target === 'values' ? revision.sequence : sequenceAtOrBefore(valuesRevisions, revision.createdAt);

    const reconstructedContent = reconstructAt(contentRevisions, contentTargetSeq);
    const reconstructedValues = reconstructValuesAt(sourcePage.values ?? {}, valuesRevisions, valuesTargetSeq);

    const now = new Date().toISOString();
    const newPageData = {
      name: body?.name ?? `${sourcePage.name} (copy)`,
      emoji: sourcePage.emoji ?? null,
      type: 'page' as const,
      parentId,
      workspaceId,
      userId: session.user.id,
      content: reconstructedContent,
      values: reconstructedValues,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
    };
    const createdPage = (await containerRepository.create(newPageData)) as PageContainer;

    await registerContainerAccessForNewPage(createdPage, session.user.id);

    // The forked page starts its own fresh history at sequence 1 (a single baseline snapshot of
    // the forked content) — never shares/continues the source page's revision stream.
    await createContentBaseline({ page: createdPage, content: reconstructedContent, author: session.user.id });

    scheduleNotifyPageChange('page.created', createdPage, { appId: session.appContext?.appId });

    return {
      id: createdPage.id,
      name: createdPage.name,
      parentId: createdPage.parentId || null,
      createdAt: createdPage.createdAt,
      lastUpdated: createdPage.lastUpdated,
    };
  }
);
