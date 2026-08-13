import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { computeReorderKey } from '@/lib/database/sort-order-service';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { toWebhookActor } from '@/lib/webhooks/actor';
import { scheduleNotificationDispatch } from '@/lib/notifications/notify-service';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import type { ReorderPageBody, ReorderPageParameters, ReorderPageResponse } from '@/types/api';
import { reorderPageBodySchema, reorderPageParametersSchema } from '@/types/api';

/**
 * Reorders a page within its sibling group (`workspaceId` + `parentId`), rewriting only the
 * moved row's `sortOrder` — an O(1) write, no re-numbering of siblings. A dedicated endpoint
 * (rather than overloading `PATCH /pages/:id`, which handles name/emoji/cover) so the reorder
 * concern, its validation, and its OpenAPI surface stay isolated (THOTH-036).
 */
export const POST = apiRoute<ReorderPageResponse, {}, ReorderPageParameters, ReorderPageBody>(
  {
    expectedParamsSchema: reorderPageParametersSchema,
    expectedBodySchema: reorderPageBodySchema,
  },
  async ({ params, body }, session) => {
    if (!body) {
      throw new BadRequestError('Body is required');
    }

    // Content is scoped by workspace membership + grant, not creator (THOTH-042); mutation
    // (write) permission is enforced so a read-only-scoped member/App cannot reorder.
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page, { mutating: true });

    if (!page.parentId) {
      // Root-level pages are never manually ordered (out of scope for THOTH-036) — there is no
      // sibling group to reorder within.
      throw new BadRequestError('Root-level pages cannot be reordered');
    }

    if (body.beforeId === params.id || body.afterId === params.id) {
      throw new BadRequestError('A page cannot be anchored to itself');
    }

    const containerRepository = await getContainerRepository();

    // Single-item list / no-op: both anchors absent means there's nothing to anchor against —
    // return the page unchanged.
    if (!body.beforeId && !body.afterId) {
      return {
        id: page.id,
        name: page.name,
        emoji: page.emoji || null,
        cover: page.cover ?? null,
        parentId: page.parentId || null,
        sortOrder: page.sortOrder ?? null,
        createdAt: page.createdAt,
        lastUpdated: page.lastUpdated,
      } satisfies ReorderPageResponse;
    }

    // Anchors must share the moved page's own (workspaceId, parentId) sibling group — this
    // prevents a caller from smuggling a page into a different group via crafted anchor ids,
    // and re-parenting/moving between parents is out of scope for this ticket. Also excludes
    // soft-deleted rows and non-page rows, so a client can't anchor against a sibling that no
    // listing shows.
    const anchorIds: string[] = [body.beforeId, body.afterId].filter((id): id is string => typeof id === 'string');
    const anchors =
      anchorIds.length > 0
        ? await containerRepository.getByQuery(
            addWorkspaceIdToQuery(containerRepository.createQuery(), page.workspaceId)
              .eq('parentId', page.parentId)
              .eq('type', 'page')
              .in('id', anchorIds)
          )
        : [];
    const anchorsById = new Map(anchors.filter((anchor) => !anchor.deletedAt).map((anchor) => [anchor.id, anchor]));

    if (body.beforeId && !anchorsById.has(body.beforeId)) {
      throw new BadRequestError('beforeId is not a sibling of the moved page');
    }
    if (body.afterId && !anchorsById.has(body.afterId)) {
      throw new BadRequestError('afterId is not a sibling of the moved page');
    }

    const beforeKey = body.beforeId ? (anchorsById.get(body.beforeId)?.sortOrder ?? null) : null;
    const afterKey = body.afterId ? (anchorsById.get(body.afterId)?.sortOrder ?? null) : null;

    const newSortOrder = await computeReorderKey({
      workspaceId: page.workspaceId,
      parentId: page.parentId,
      movedId: page.id,
      beforeId: body.beforeId,
      beforeKey,
      afterId: body.afterId,
      afterKey,
    });

    const updatedPage = await containerRepository.update({
      ...page,
      sortOrder: newSortOrder,
      lastUpdated: new Date().toISOString(),
    });

    scheduleNotifyPageChange('page.updated', updatedPage, toWebhookActor(session));
    scheduleNotificationDispatch('page.updated', updatedPage, toWebhookActor(session));

    return {
      id: updatedPage.id,
      name: updatedPage.name,
      emoji: 'emoji' in updatedPage ? updatedPage.emoji : null,
      cover: 'cover' in updatedPage ? (updatedPage.cover ?? null) : null,
      parentId: updatedPage.parentId || null,
      sortOrder: updatedPage.sortOrder ?? null,
      createdAt: updatedPage.createdAt,
      lastUpdated: updatedPage.lastUpdated,
    } satisfies ReorderPageResponse;
  }
);
