import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getPageRevisionRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { reconstructAt, reconstructValuesAt } from '@/lib/history/reconstruct';
import { recordContentRevision, recordValuesRevision } from '@/lib/history/revision-service';
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
    await assertGrantAllowsContainerForSession(session, page);

    const repository = await getPageRevisionRepository();
    const revision = await repository.getOneByQuery(
      addUserIdToQuery(repository.createQuery().eq('id', params.revisionId), session.user.id)
    );

    if (!revision || revision.containerId !== params.id) {
      throw new NotFoundError('Revision not found', true);
    }

    if (revision.target === 'content') {
      const revisions = await repository.getByQuery(
        addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
          .eq('target', 'content')
          .sort('sequence', 'asc')
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

      scheduleNotifyPageChange('page.updated', updatedPage, { appId: session.appContext?.appId });

      const contentRevisions = await repository.getByQuery(
        addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
          .eq('target', 'content')
          .sort('sequence', 'desc')
          .limit(1)
      );

      return { target: 'content', sequence: contentRevisions[0]?.sequence ?? revision.sequence };
    }

    const valuesRevisions = await repository.getByQuery(
      addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
        .eq('target', 'values')
        .sort('sequence', 'asc')
    );
    const reconstructedValues = reconstructValuesAt(page.values ?? {}, valuesRevisions, revision.sequence);

    // Drop columns that no longer exist on the parent data source (a values restore should
    // never resurrect a stale column id the values route itself would reject going forward).
    let filteredValues = reconstructedValues;
    if (page.parentId) {
      const dataSource = await dataSourceRetriever.retrieveDataSource(page.parentId, session.user.id);
      const validColumnIds = new Set((dataSource.columns ?? []).map((column) => column.id));
      filteredValues = Object.fromEntries(
        Object.entries(reconstructedValues).filter(([columnId]) => validColumnIds.has(columnId))
      );
    }

    const changed: typeof filteredValues = {};
    for (const [columnId, value] of Object.entries(filteredValues)) {
      if (JSON.stringify(page.values?.[columnId] ?? null) !== JSON.stringify(value)) {
        changed[columnId] = value;
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

    scheduleNotifyPageChange('page.updated', updatedPage, { appId: session.appContext?.appId });

    const newHeadValuesRevisions = await repository.getByQuery(
      addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
        .eq('target', 'values')
        .sort('sequence', 'desc')
        .limit(1)
    );

    return { target: 'values', sequence: newHeadValuesRevisions[0]?.sequence ?? revision.sequence };
  }
);
