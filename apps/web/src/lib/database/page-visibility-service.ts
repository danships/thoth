import { getContainerRepository } from './index';
import { collectDescendantPageIds } from './soft-delete-service';
import { addWorkspaceIdToQuery } from './helpers';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { getLogger } from '@/lib/logger';
import type { PageContainer } from '@thoth/database/types';

// THOTH-077: "Private" is an ambient-discovery-only flag (excludes a page — and, via cascade,
// its descendants — from the sidebar Recent list and any future page search). It is
// deliberately *not* an access-control mechanism: a private page stays fully readable/writable
// via the tree, a direct link, or Favorites through the existing `AccessGrant` checks
// (`assertContentAccess`/`filterContainersByGrantForSession`). Do not conflate this service with
// those.

/**
 * Filters out private containers from an already-fetched list — used by `Recent` (and, in the
 * future, page search) to exclude `isPrivate` rows in addition to whatever other filtering the
 * caller already applies (e.g. `!container.deletedAt`). Kept intentionally trivial and scoped to
 * this ticket's own need; not generalized further since no search feature exists yet to share it
 * with.
 */
export function excludePrivateContainers<T extends { isPrivate?: boolean }>(containers: T[]): T[] {
  return containers.filter((c) => !c.isPrivate);
}

/**
 * Marks `page` (and, when marking private, its descendants) private/public, mirroring
 * `cascadeSoftDeletePage`'s descendant-collection-and-update shape. Only ever called by the
 * route when `isPrivate` actually differs from the page's current state (idempotent resubmits
 * never re-enter this function, so `affectedPageCount: 0` is the route's own no-op short
 * circuit, not something this function needs to special-case).
 *
 * - Marking private (`isPrivate: true`): the page becomes its own privacy root
 *   (`privateRootId: page.id`) and every live descendant not already independently private
 *   (its own root, or cascaded from a different root) is cascaded to the same root pointer.
 * - Marking public (`isPrivate: false`): only descendants whose `privateRootId` points at
 *   *this* page are cleared — unrelated private pages (independently marked, or cascaded from a
 *   different root elsewhere in the tree) are left untouched. Attempting to un-mark a page that
 *   is itself a cascaded descendant of a different root (`privateRootId !== page.id`) is
 *   rejected — the caller must un-mark the actual root instead, so a private subtree can't be
 *   silently fragmented by unmarking one page in the middle of it.
 */
export async function cascadeSetPagePrivate(
  page: PageContainer,
  isPrivate: boolean
): Promise<{ affectedPageCount: number }> {
  if (!isPrivate && page.privateRootId && page.privateRootId !== page.id) {
    throw new BadRequestError(
      'This page inherited its private state from an ancestor page. Remove the private flag from that page instead.'
    );
  }

  const now = new Date().toISOString();
  const containerRepository = await getContainerRepository();
  const logger = await getLogger();

  const descendantIds = await collectDescendantPageIds(page.id, page.workspaceId);
  const descendants =
    descendantIds.length > 0
      ? await containerRepository.getByQuery(
          addWorkspaceIdToQuery(containerRepository.createQuery(), page.workspaceId)
            .eq('type', 'page')
            .in('id', descendantIds)
        )
      : [];

  await containerRepository.update({
    ...page,
    isPrivate,
    privateRootId: isPrivate ? page.id : null,
    lastUpdated: now,
  });

  let affectedPageCount = 1;
  for (const descendant of descendants) {
    if (descendant.type !== 'page') {
      continue;
    }

    if (isPrivate) {
      // Skip an already-independently-private descendant — its own privacy root pointer is
      // preserved rather than being overwritten by this cascade.
      if (descendant.isPrivate) {
        continue;
      }
    } else if (descendant.privateRootId !== page.id) {
      // Only this cascade's own descendants (privateRootId === page.id) are cleared.
      continue;
    }

    // Best-effort re-check immediately before writing: SuperSave has no transactions (see
    // `permanentlyDeleteByDeletedRootId`'s comments on this), so a concurrent mark/un-mark could
    // have changed this descendant's `privateRootId` between the initial fetch above and this
    // write. Mis-ordering here only risks a stale `isPrivate` value, never data loss (unlike
    // permanent delete), so this is logged as a warning and skipped rather than treated as fatal.
    const current = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', descendant.id));
    if (!current || current.type !== 'page' || current.privateRootId !== descendant.privateRootId) {
      logger.warn('page-visibility.descendant-changed-during-cascade', {
        rootPageId: page.id,
        descendantId: descendant.id,
      });
      continue;
    }

    await containerRepository.update({
      ...current,
      isPrivate,
      privateRootId: isPrivate ? page.id : null,
      lastUpdated: now,
    });
    affectedPageCount += 1;
  }

  return { affectedPageCount };
}

/**
 * Reconciles inherited privacy after a page is reparented. A private destination supplies its
 * root explicitly, so the moved page and its descendants inherit that same root. When moving
 * outside a private subtree, an inherited root is only cleared after confirming it is absent
 * from the new ancestry; independent private roots remain unchanged.
 */
export async function reconcilePrivateStateOnReparent(
  page: PageContainer,
  newParentId: string | null,
  destinationPrivateRootId?: string | null
): Promise<Partial<PageContainer>> {
  if (destinationPrivateRootId) {
    return page.isPrivate && page.privateRootId === destinationPrivateRootId
      ? {}
      : { isPrivate: true, privateRootId: destinationPrivateRootId };
  }

  if (!page.privateRootId || page.privateRootId === page.id) {
    return {};
  }

  const containerRepository = await getContainerRepository();
  let currentId: string | null = newParentId;
  const seen = new Set<string>();

  while (currentId) {
    if (seen.has(currentId)) {
      break;
    }
    seen.add(currentId);

    if (currentId === page.privateRootId) {
      return {};
    }

    const parent = await containerRepository.getOneByQuery(
      addWorkspaceIdToQuery(containerRepository.createQuery().eq('id', currentId), page.workspaceId)
    );
    if (!parent || parent.type !== 'page') {
      break;
    }
    currentId = parent.parentId ?? null;
  }

  return { isPrivate: false, privateRootId: null };
}
