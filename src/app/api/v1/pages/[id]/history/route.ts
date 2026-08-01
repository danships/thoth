import { apiRoute } from '@/lib/api/route-wrapper';
import { getPageRevisionRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import {
  getPageHistoryParametersSchema,
  getPageHistoryQuerySchema,
  type GetPageHistoryParameters,
  type GetPageHistoryQuery,
  type GetPageHistoryResponse,
  type PageHistoryRevisionSummary,
} from '@/types/api/endpoints/get-page-history';
import type { PageRevision } from '@/types/database';

// Cursor encodes the last-seen row's sort key (`createdAt` then `id` as a tiebreaker) so paging
// is stable even when multiple revisions share a millisecond-resolution timestamp.
function encodeCursor(revision: Pick<PageRevision, 'createdAt' | 'id'>): string {
  return Buffer.from(JSON.stringify([revision.createdAt, revision.id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(decoded) &&
      decoded.length === 2 &&
      typeof decoded[0] === 'string' &&
      typeof decoded[1] === 'string'
    ) {
      return [decoded[0], decoded[1]];
    }
    return null;
  } catch {
    return null;
  }
}

function compareNewestFirst(a: PageRevision, b: PageRevision): number {
  const byCreatedAt = b.createdAt.localeCompare(a.createdAt);
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }
  return b.id.localeCompare(a.id);
}

function toSummary(revision: PageRevision): PageHistoryRevisionSummary {
  const summary: PageHistoryRevisionSummary = {
    id: revision.id,
    sequence: revision.sequence,
    target: revision.target,
    createdAt: revision.createdAt,
    author: revision.author,
    kind: revision.kind,
    consolidated: revision.consolidated,
    charsAdded: revision.charsAdded,
    charsRemoved: revision.charsRemoved,
  };
  if (revision.target === 'values' && revision.valuesBefore) {
    summary.changedColumns = Object.keys(JSON.parse(revision.valuesBefore) as Record<string, unknown>);
  }
  return summary;
}

export const GET = apiRoute<GetPageHistoryResponse, GetPageHistoryQuery, GetPageHistoryParameters>(
  {
    expectedParamsSchema: getPageHistoryParametersSchema,
    expectedQuerySchema: getPageHistoryQuerySchema,
  },
  async ({ params, query }, session) => {
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    const repository = await getPageRevisionRepository();
    let databaseQuery = addUserIdToQuery(repository.createQuery().eq('containerId', params.id), session.user.id);
    if (query.target !== 'all') {
      databaseQuery = databaseQuery.eq('target', query.target);
    }

    const fetchedRevisions = await repository.getByQuery(databaseQuery);
    const revisions = fetchedRevisions.toSorted(compareNewestFirst);

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const startIndex = cursor
      ? revisions.findIndex((revision) => revision.createdAt === cursor[0] && revision.id === cursor[1]) + 1
      : 0;

    const pageSlice = revisions.slice(startIndex, startIndex + query.limit + 1);
    const hasMore = pageSlice.length > query.limit;
    const pageRevisions = pageSlice.slice(0, query.limit);

    return {
      revisions: pageRevisions.map((revision) => toSummary(revision)),
      nextCursor: hasMore && pageRevisions.length > 0 ? encodeCursor(pageRevisions.at(-1)!) : null,
    };
  }
);
