import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerAccessRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import type { RegisterPageAccessParameters, RegisterPageAccessResponse } from '@/types/api';
import { registerPageAccessParametersSchema } from '@/types/api';

// Explicitly registers a "page opened" event, driving the root-list sort order in
// `GET /pages/tree`. Decoupled from any `GET` call so background prefetches/hover-preloads
// never silently reorder the sidebar tree — only this UI-triggered call updates `lastAccessedAt`.
export const POST = apiRoute<RegisterPageAccessResponse, {}, RegisterPageAccessParameters, {}>(
  {
    expectedParamsSchema: registerPageAccessParametersSchema,
  },
  async ({ params }, session) => {
    // Ensures the page exists and is visible to the current user before any access record
    // is written or updated — no ContainerAccess row can be created for a page the requester
    // cannot see.
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

    const containerAccessRepository = await getContainerAccessRepository();
    const existing = await containerAccessRepository.getOneByQuery(
      addUserIdToQuery(containerAccessRepository.createQuery().eq('containerId', page.id), session.user.id)
    );

    const lastAccessedAt = new Date().toISOString();

    const upserted = existing
      ? await containerAccessRepository.update({
          ...existing,
          parentId: page.parentId || null,
          lastAccessedAt,
        })
      : await containerAccessRepository.create({
          userId: session.user.id,
          containerId: page.id,
          parentId: page.parentId || null,
          workspaceId: page.workspaceId,
          lastAccessedAt,
          starred: false,
          starredAt: null,
          createdAt: lastAccessedAt,
        });

    return {
      id: upserted.id,
      containerId: upserted.containerId,
      parentId: upserted.parentId || null,
      lastAccessedAt: upserted.lastAccessedAt,
    };
  }
);
