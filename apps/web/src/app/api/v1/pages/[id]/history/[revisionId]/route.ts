import { apiRoute } from '@/lib/api/route-wrapper';
import { getPageRevisionRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { reconstructAt, reconstructValuesAt } from '@thoth/shared';
import {
  getPageRevisionParametersSchema,
  type GetPageRevisionParameters,
  type GetPageRevisionResponse,
} from '@/types/api/endpoints/get-page-revision';

export const GET = apiRoute<GetPageRevisionResponse, undefined, GetPageRevisionParameters>(
  {
    expectedParamsSchema: getPageRevisionParametersSchema,
  },
  async ({ params }, session) => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    const repository = await getPageRevisionRepository();
    const revision = await repository.getOneByQuery(
      addUserIdToQuery(repository.createQuery().eq('id', params.revisionId), session.user.id)
    );

    // Never trust `revisionId` alone — it must also belong to this exact page.
    if (!revision || revision.containerId !== params.id) {
      throw new NotFoundError('Revision not found', true);
    }

    if (revision.target === 'content') {
      const revisions = await repository.getByQuery(
        addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
          .eq('target', 'content')
          .sort('sequence', 'asc')
      );

      return {
        target: 'content',
        sequence: revision.sequence,
        content: reconstructAt(revisions, revision.sequence),
        currentContent: page.content ?? '',
      };
    }

    const valuesRevisions = await repository.getByQuery(
      addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id)
        .eq('target', 'values')
        .sort('sequence', 'asc')
    );

    // Column names are looked up live from the parent Data Source (not versioned alongside
    // values) — the parent may be a plain page rather than a Data Source, in which case there
    // are no columns to label with.
    let columns: Array<{ id: string; name: string }> = [];
    if (page.parentId) {
      try {
        const dataSource = await dataSourceRetriever.retrieveDataSource(page.parentId, session.user.id);
        // Content access (workspace membership + grant) must be re-checked against the parent
        // Data Source itself — it is a separate content row, not covered by the child page's
        // grant, and an App session's scope may differ between the two (THOTH-042).
        await assertGrantAllowsContainerForSession(session, dataSource);
        columns = dataSource.columns.map((column) => ({ id: column.id, name: column.name }));
      } catch (error) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
    }

    return {
      target: 'values',
      sequence: revision.sequence,
      values: reconstructValuesAt(page.values ?? {}, valuesRevisions, revision.sequence),
      currentValues: page.values ?? {},
      columns,
    };
  }
);
