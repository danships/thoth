import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getPageRevisionRepository } from '@/lib/database';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import { scheduleNotificationDispatch } from '@/lib/notifications/notify-service';
import { reconstructAt, reconstructValuesAt } from '@thoth/shared';
import { recordContentRevision, recordValuesRevision } from '@thoth/database';
import type { PageValue } from '@/types/schemas/entities/container';
import {
  restorePageRevisionParametersSchema,
  type RestorePageRevisionParameters,
  type RestorePageRevisionResponse,
} from '@/types/api/endpoints/restore-page-revision';

export const POST = apiRoute<RestorePageRevisionResponse, undefined, RestorePageRevisionParameters>(
  {
    expectedParamsSchema: restorePageRevisionParametersSchema,
  },
  async ({ params }, session) => {
    const containerRepository = await getContainerRepository();
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page, { mutating: true });

    const repository = await getPageRevisionRepository();
    const revision = await repository.getOneByQuery(repository.createQuery().eq('id', params.revisionId));

    if (!revision || revision.containerId !== params.id) {
      throw new NotFoundError('Revision not found', true);
    }

    if (revision.target === 'content') {
      const revisions = await repository.getByQuery(
        repository.createQuery().eq('containerId', params.id).eq('target', 'content').sort('sequence', 'asc')
      );
      const restoredContent = reconstructAt(revisions, revision.sequence);

      const updatedPage = await containerRepository.update({
        ...page,
        content: restoredContent,
        lastUpdated: new Date().toISOString(),
      });

      // Restore is append-only and traceable — it goes through the normal recording path so a
      // new revision ("restored to sequence N") shows up at the top of the timeline.
      await recordContentRevision({ page, newContent: restoredContent, author: session.user.id });

      scheduleNotifyPageChange('page.updated', updatedPage, toWebhookActor(session));
      scheduleNotificationDispatch('page.updated', updatedPage, toWebhookActor(session));

      const contentRevisions = await repository.getByQuery(
        repository.createQuery().eq('containerId', params.id).eq('target', 'content').sort('sequence', 'desc').limit(1)
      );

      return { target: 'content', sequence: contentRevisions[0]?.sequence ?? revision.sequence };
    }

    const valuesRevisions = await repository.getByQuery(
      repository.createQuery().eq('containerId', params.id).eq('target', 'values').sort('sequence', 'asc')
    );
    const reconstructedValues = reconstructValuesAt(page.values ?? {}, valuesRevisions, revision.sequence);

    // Drop columns that no longer exist on the parent data source (a values restore should
    // never resurrect a stale column id the values route itself would reject going forward).
    // `page.parentId` can point at either a plain page or a data source — only data sources
    // carry `columns`, so the filter only applies when the resolved parent is one.
    let filteredValues = reconstructedValues;
    if (page.parentId) {
      const parentContainer = await containerRepository.getOneByQuery(
        containerRepository.createQuery().eq('id', page.parentId)
      );
      if (parentContainer?.type === 'data-source') {
        const validColumnIds = new Set((parentContainer.columns ?? []).map((column) => column.id));
        filteredValues = Object.fromEntries(
          Object.entries(reconstructedValues).filter(([columnId]) => validColumnIds.has(columnId))
        );
      }
    }

    const changed: Record<string, PageValue | null> = {};
    for (const [columnId, value] of Object.entries(filteredValues)) {
      if (JSON.stringify(page.values?.[columnId] ?? null) !== JSON.stringify(value)) {
        changed[columnId] = value;
      }
    }
    // Columns present on the page now but dropped by the restore (either filtered out above, or
    // simply absent from the reconstructed historical state) are removals — the update below
    // writes `filteredValues` as the complete value set, so without recording these the removal
    // is silently unrecoverable and missing from the timeline summary.
    for (const columnId of Object.keys(page.values ?? {})) {
      if (!(columnId in filteredValues)) {
        changed[columnId] = null;
      }
    }

    const updatedPage = await containerRepository.update({
      ...page,
      values: filteredValues,
      lastUpdated: new Date().toISOString(),
    });

    if (Object.keys(changed).length > 0) {
      await recordValuesRevision({ page, changed, author: session.user.id });
    }

    scheduleNotifyPageChange('page.updated', updatedPage, toWebhookActor(session));
    scheduleNotificationDispatch('page.updated', updatedPage, toWebhookActor(session));

    const newHeadValuesRevisions = await repository.getByQuery(
      repository.createQuery().eq('containerId', params.id).eq('target', 'values').sort('sequence', 'desc').limit(1)
    );

    return { target: 'values', sequence: newHeadValuesRevisions[0]?.sequence ?? revision.sequence };
  }
);
