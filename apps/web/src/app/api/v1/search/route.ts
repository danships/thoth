import { searchWorkspace } from '@thoth/job-protocol';
import { apiRoute } from '@/lib/api/route-wrapper';
import { assertContentAccess, assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { filterContainersByGrant, memberToAccessGrant } from '@/lib/auth/access-grant';
import { type ApiKeySession } from '@/lib/auth/session';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { ServiceUnavailableError } from '@/lib/errors/service-unavailable-error';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { getEnvironment } from '@/lib/environment';
import { getLogger } from '@/lib/logger';
import type { GetSearchResultsQuery, GetSearchResultsResponse } from '@/types/api';
import { getSearchResultsQuerySchema } from '@/types/api';

export async function queryWorkspaceSearchResults(
  query: GetSearchResultsQuery,
  session: ApiKeySession
): Promise<GetSearchResultsResponse> {
  const member = await assertWorkspaceAccess(session.user.id, query.workspaceId);
  const grant = session.appContext ? session.appContext.accessGrant : await memberToAccessGrant(member);

  if (grant.workspaceId !== query.workspaceId) {
    // An App key's grant is bound to the workspace it was issued for; `assertWorkspaceAccess`
    // above only verifies the *user* behind the key is a member of `query.workspaceId`, so this
    // is an authorization failure for an App key scoped to a different workspace. Mirror
    // `assertWorkspaceAccess` and never confirm the target workspace exists.
    throw new NotFoundError('Workspace not found');
  }

  if (query.type === 'data-view') return queryDataViewSearchResults(query, grant);
  return queryPageSearchResults(query, session, grant);
}

async function queryPageSearchResults(
  query: GetSearchResultsQuery,
  session: ApiKeySession,
  grant: Awaited<ReturnType<typeof memberToAccessGrant>>
): Promise<GetSearchResultsResponse> {
  const logger = await getLogger();
  const socketPath = process.env['JOB_SOCKET_PATH'];
  const environment = await getEnvironment();

  if (!socketPath) {
    logger.error('search.query.failed', {
      workspaceId: query.workspaceId,
      error: new Error('JOB_SOCKET_PATH is not configured'),
    });
    throw new ServiceUnavailableError('Search is temporarily unavailable');
  }

  let candidates: Awaited<ReturnType<typeof searchWorkspace>>;
  try {
    candidates = await searchWorkspace({
      socketPath,
      workspaceId: query.workspaceId,
      query: query.query,
      limit: query.limit,
      grant,
      responseTimeoutMs: environment.SEARCH_QUERY_TIMEOUT_MS,
    });
  } catch (error) {
    logger.error('search.query.failed', {
      workspaceId: query.workspaceId,
      error,
    });
    throw new ServiceUnavailableError('Search is temporarily unavailable');
  }

  const containerRepository = await getContainerRepository();
  const results: GetSearchResultsResponse['results'] = [];

  for (const candidate of candidates) {
    const container = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', candidate.pageId).eq('workspaceId', query.workspaceId)
    );

    if (!container || container.type !== 'page' || container.deletedAt !== null) {
      continue;
    }

    try {
      await assertContentAccess(session, container);
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) {
        continue;
      }
      throw error;
    }

    const ancestors: Array<{ id: string; name: string }> = [];
    let parentId = container.parentId;
    const seenAncestorIds = new Set<string>();
    while (parentId && !seenAncestorIds.has(parentId)) {
      seenAncestorIds.add(parentId);
      const ancestor = await containerRepository.getOneByQuery(
        containerRepository.createQuery().eq('id', parentId).eq('workspaceId', query.workspaceId)
      );
      if (!ancestor || ancestor.type !== 'page' || ancestor.deletedAt !== null) break;
      ancestors.unshift({ id: ancestor.id, name: ancestor.name });
      parentId = ancestor.parentId;
    }

    results.push({
      kind: 'page',
      page: {
        id: container.id,
        name: container.name,
        emoji: container.emoji ?? null,
        parentId: container.parentId ?? null,
        isPrivate: container.isPrivate,
      },
      ancestors,
      score: candidate.score,
      snippet: candidate.snippet,
    });

    if (results.length >= query.limit) {
      break;
    }
  }

  return { results };
}

async function queryDataViewSearchResults(
  query: GetSearchResultsQuery,
  grant: Awaited<ReturnType<typeof memberToAccessGrant>>
): Promise<GetSearchResultsResponse> {
  const dataViewRepository = await getDataViewRepository();
  const dataViews = (
    await dataViewRepository.getByQuery(
      addWorkspaceIdToQuery(dataViewRepository.createQuery().like('name', `*${query.query}*`), query.workspaceId)
    )
  ).filter(
    (view) => view.deletedAt === null && view.name.toLocaleLowerCase().includes(query.query.toLocaleLowerCase())
  );
  const sourceIds = [...new Set(dataViews.map((view) => view.dataSourceId))];
  const containerRepository = await getContainerRepository();
  const sources =
    sourceIds.length === 0
      ? []
      : await containerRepository.getByQuery(
          addWorkspaceIdToQuery(containerRepository.createQuery().in('id', sourceIds), query.workspaceId)
        );
  const allowed = await filterContainersByGrant(
    grant,
    sources.filter((source) => source.type === 'data-source' && source.deletedAt === null)
  );
  const sourcesById = new Map(allowed.map((source) => [source.id, source]));
  const needle = query.query.toLocaleLowerCase();
  const rank = (name: string) => {
    const value = name.toLocaleLowerCase();
    return value === needle ? 0 : value.startsWith(needle) ? 1 : 2;
  };
  return {
    results: dataViews
      .filter((view) => sourcesById.has(view.dataSourceId))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(0, query.limit)
      .map((view) => ({
        kind: 'data-view' as const,
        dataView: {
          id: view.id,
          name: view.name,
          dataSourceId: view.dataSourceId,
          dataSourceName: sourcesById.get(view.dataSourceId)!.name,
        },
      })),
  };
}

export const GET = apiRoute<GetSearchResultsResponse, GetSearchResultsQuery, {}, {}>(
  {
    expectedQuerySchema: getSearchResultsQuerySchema,
  },
  async ({ query }, session) => queryWorkspaceSearchResults(query, session)
);
