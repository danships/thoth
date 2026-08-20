import { searchWorkspace } from '@thoth/job-protocol';
import { apiRoute } from '@/lib/api/route-wrapper';
import { assertContentAccess, assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { memberToAccessGrant } from '@/lib/auth/access-grant';
import { type ApiKeySession } from '@/lib/auth/session';
import { getContainerRepository } from '@/lib/database';
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
    throw new Error('Resolved search grant workspace mismatch');
  }

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
      query: query.q,
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

    if (!container || container.type !== 'page' || container.deletedAt !== null || container.isPrivate === true) {
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

    results.push({
      page: {
        id: container.id,
        name: container.name,
        emoji: container.emoji ?? null,
        parentId: container.parentId ?? null,
      },
      score: candidate.score,
      snippet: candidate.snippet,
    });

    if (results.length >= query.limit) {
      break;
    }
  }

  return { results };
}

export const GET = apiRoute<GetSearchResultsResponse, GetSearchResultsQuery, {}, {}>(
  {
    expectedQuerySchema: getSearchResultsQuerySchema,
  },
  async ({ query }, session) => queryWorkspaceSearchResults(query, session)
);
