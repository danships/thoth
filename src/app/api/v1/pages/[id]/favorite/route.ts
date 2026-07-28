import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import type { PutPageFavoriteBody, PutPageFavoriteParameters, PutPageFavoriteResponse } from '@/types/api';
import { putPageFavoriteBodySchema, putPageFavoriteParametersSchema } from '@/types/api';

// Sets (rather than toggles) a page's starred status — idempotent, so double-submits/double
// clicks from the frontend can never end up flipping state twice.
export const PUT = apiRoute<PutPageFavoriteResponse, {}, PutPageFavoriteParameters, PutPageFavoriteBody>(
  {
    expectedParamsSchema: putPageFavoriteParametersSchema,
    expectedBodySchema: putPageFavoriteBodySchema,
  },
  async ({ params, body }, session) => {
    // Ensures the page exists and is visible to the current user before any ContainerAccess
    // row is written or updated — a user can never star/unstar a page they don't own.
    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    const containerAccessRepository = await getContainerAccessRepository();
    const existing = await containerAccessRepository.getOneByQuery(
      addUserIdToQuery(containerAccessRepository.createQuery().eq('containerId', page.id), session.user.id)
    );

    const now = new Date().toISOString();
    const starred = body.starred;
    const starredAt = starred ? now : null;

    // Starring a page also counts as an implicit "open" for root-list ordering purposes, so
    // `lastAccessedAt` is bumped alongside `starred`/`starredAt`. Unstarring leaves it untouched;
    // a page with no existing access row that's being unstarred falls back to its creation time
    // rather than `now`, so a no-op unstar never bumps it in root-list ordering.
    const lastAccessedAt = starred ? now : (existing?.lastAccessedAt ?? page.createdAt);

    const upserted = existing
      ? await containerAccessRepository.update({
          ...existing,
          parentId: page.parentId || null,
          starred,
          starredAt,
          lastAccessedAt,
        })
      : await containerAccessRepository.create({
          userId: session.user.id,
          containerId: page.id,
          parentId: page.parentId || null,
          workspaceId: page.workspaceId,
          lastAccessedAt,
          starred,
          starredAt,
          createdAt: now,
        });

    return {
      id: upserted.id,
      containerId: upserted.containerId,
      starred: upserted.starred ?? false,
      starredAt: upserted.starredAt ?? null,
      lastAccessedAt: upserted.lastAccessedAt,
    };
  }
);
