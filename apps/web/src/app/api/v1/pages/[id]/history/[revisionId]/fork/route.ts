import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getPageRevisionRepository } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { registerContainerAccessForNewPage } from '@/lib/database/container-access-service';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import { scheduleNotificationDispatch } from '@/lib/notifications/notify-service';
import { reconstructAt, reconstructValuesAt } from '@thoth/shared';
import { createContentBaseline } from '@thoth/database';
import type { PageRevision, PageContainer, Container } from '@thoth/database/types';
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
    await assertGrantAllowsContainerForSession(session, sourcePage, { mutating: true });

    const repository = await getPageRevisionRepository();
    const revision = await repository.getOneByQuery(repository.createQuery().eq('id', params.revisionId));
    if (!revision || revision.containerId !== params.id) {
      throw new NotFoundError('Revision not found', true);
    }

    let workspaceId: string;
    // Defaults to the source page's own parent (keeping the fork alongside it) rather than
    // always forking to the workspace root.
    let parentId: string | null = sourcePage.parentId ?? null;
    // Only set when `body.parentId` overrides the parent — used below to decide whether the
    // forked page's values need to be filtered against a (possibly different) parent data
    // source's columns.
    let newParentContainer: Container | null = null;

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
      newParentContainer = parentContainer;
    } else {
      workspaceId = sourcePage.workspaceId;
      await assertWorkspaceAccess(session.user.id, workspaceId);
    }

    const contentRevisions = await repository.getByQuery(
      repository.createQuery().eq('containerId', params.id).eq('target', 'content').sort('sequence', 'asc')
    );
    const valuesRevisions = await repository.getByQuery(
      repository.createQuery().eq('containerId', params.id).eq('target', 'values').sort('sequence', 'asc')
    );

    const contentTargetSeq =
      revision.target === 'content' ? revision.sequence : sequenceAtOrBefore(contentRevisions, revision.createdAt);
    const valuesTargetSeq =
      revision.target === 'values' ? revision.sequence : sequenceAtOrBefore(valuesRevisions, revision.createdAt);

    const reconstructedContent = reconstructAt(contentRevisions, contentTargetSeq);
    const reconstructedValues = reconstructValuesAt(sourcePage.values ?? {}, valuesRevisions, valuesTargetSeq);

    // The reconstructed values are keyed by the *source* page's parent data source's column
    // ids. Only carry them over unchanged when the fork keeps the same parent (no `body.parentId`
    // override); otherwise filter against the resolved new parent's columns — dropping all
    // values when the new parent is a plain page (or has no parent at all), matching the restore
    // route's stale-column handling.
    let forkedValues: typeof reconstructedValues = reconstructedValues;
    if (body?.parentId) {
      forkedValues = {};
      if (newParentContainer?.type === 'data-source') {
        const validColumnIds = new Set((newParentContainer.columns ?? []).map((column) => column.id));
        forkedValues = Object.fromEntries(
          Object.entries(reconstructedValues).filter(([columnId]) => validColumnIds.has(columnId))
        );
      }
    }

    const now = new Date().toISOString();
    const newPageData = {
      name: body?.name ?? `${sourcePage.name} (copy)`,
      emoji: sourcePage.emoji ?? null,
      type: 'page' as const,
      parentId,
      workspaceId,
      userId: session.user.id,
      content: reconstructedContent,
      values: forkedValues,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      // The fork inherits the source page's private state (THOTH-077), but since it's a
      // brand-new `Container` row it becomes its *own* privacy root rather than copying the
      // source's `privateRootId` verbatim — that pointer would otherwise dangle (it'd reference
      // the source's cascade, not this new row's).
      isPrivate: sourcePage.isPrivate,
      privateRootId: null,
    };
    const createdPage = (await containerRepository.create(newPageData)) as PageContainer;

    const finalPage = createdPage.isPrivate
      ? ((await containerRepository.update({
          ...createdPage,
          privateRootId: createdPage.id,
        })) as PageContainer)
      : createdPage;

    await registerContainerAccessForNewPage(finalPage, session.user.id);

    // The forked page starts its own fresh history at sequence 1 (a single baseline snapshot of
    // the forked content) — never shares/continues the source page's revision stream.
    await createContentBaseline({ page: finalPage, content: reconstructedContent, author: session.user.id });

    scheduleNotifyPageChange('page.created', finalPage, toWebhookActor(session));
    scheduleNotificationDispatch('page.created', finalPage, toWebhookActor(session));

    return {
      id: finalPage.id,
      name: finalPage.name,
      parentId: finalPage.parentId || null,
      createdAt: createdPage.createdAt,
      lastUpdated: createdPage.lastUpdated,
    };
  }
);
