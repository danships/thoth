import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import {
  assertGrantAllowsContainerForSession,
  assertGrantAllowsWrite,
  filterContainersByGrantForSession,
  memberToAccessGrant,
} from '@/lib/auth/access-grant';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { collectDescendantPageIds } from '@/lib/database/soft-delete-service';
import type { PageContainer } from '@thoth/database/types';
import type {
  GetPageParentOptionsParameters,
  GetPageParentOptionsQuery,
  GetPageParentOptionsResponse,
} from '@/types/api';
import { getPageParentOptionsParametersSchema, getPageParentOptionsQuerySchema } from '@/types/api';

export const GET = apiRoute<
  GetPageParentOptionsResponse,
  GetPageParentOptionsQuery,
  GetPageParentOptionsParameters,
  {}
>(
  { expectedParamsSchema: getPageParentOptionsParametersSchema, expectedQuerySchema: getPageParentOptionsQuerySchema },
  async ({ params, query }, session) => {
    const source = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, source);
    const member = await assertWorkspaceAccess(session.user.id, source.workspaceId);
    const grant = session.appContext?.accessGrant ?? (await memberToAccessGrant(member));
    assertGrantAllowsWrite(grant);
    const repository = await getContainerRepository();
    const pages = await filterContainersByGrantForSession(
      session,
      await repository.getByQuery(
        addWorkspaceIdToQuery(repository.createQuery().eq('type', 'page'), source.workspaceId)
      )
    );
    const available = pages.filter((page): page is PageContainer => page.type === 'page' && !page.deletedAt);
    const excluded = new Set<string>();
    if (query.action === 'move') {
      excluded.add(source.id);
      if (source.parentId) excluded.add(source.parentId);
      for (const id of await collectDescendantPageIds(source.id, source.workspaceId)) excluded.add(id);
    }
    const byId = new Map(available.map((page) => [page.id, page]));
    const needle = (query.query ?? '').trim().toLocaleLowerCase();
    const rank = (name: string) => {
      const value = name.toLocaleLowerCase();
      if (value === needle) return 0;
      if (value.startsWith(needle)) return 1;
      return 2;
    };
    const options = available
      .filter((page) => !excluded.has(page.id) && (!needle || page.name.toLocaleLowerCase().includes(needle)))
      .sort(
        (a, b) =>
          rank(a.name) - rank(b.name) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: 'accent' }) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, query.limit)
      .map((page) => {
        const ancestorNames: string[] = [];
        let parentId = page.parentId;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId)) {
          seen.add(parentId);
          const parent = byId.get(parentId);
          if (!parent) break;
          ancestorNames.unshift(parent.name);
          parentId = parent.parentId;
        }
        return {
          id: page.id,
          name: page.name,
          emoji: page.emoji ?? null,
          parentId: page.parentId ?? null,
          isPrivate: page.isPrivate,
          ancestorNames,
        };
      });
    return { rootAllowed: grant.scopeType === 'workspace', options };
  }
);
