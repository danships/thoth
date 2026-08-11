import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getContainerRepository,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
  getWorkspaceSlugRedirectRepository,
} from './index';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { LAST_WORKSPACE_COOKIE } from '@/lib/workspace/last-workspace-cookie';
import type { Workspace } from '@thoth/database/types';

/**
 * Resolves the workspace addressed by `slug` for `userId`, enforcing membership the same way
 * `assertWorkspaceAccess` does for the API. If `slug` doesn't match any live, non-deleted
 * workspace the user is a member of, falls back to the `WorkspaceSlugRedirect` table (a
 * previous slug of one of the user's own workspaces, e.g. after a rename) and issues a
 * permanent redirect to the canonical slug, preserving the rest of the requested path/query
 * (read from the `x-pathname` header set by `src/proxy.ts`, since Server Components below
 * a layout don't otherwise have access to the full current request pathname).
 *
 * Redirects (via `next/navigation`'s `redirect()`, which throws) rather than returning
 * `undefined` for the "no such workspace" case — there's nothing useful a caller could render
 * for "you're not a member of any workspace with this slug"; falling back to `/` lets the root
 * page resolve the user's actual current/default workspace instead.
 */
export async function resolveWorkspaceForSlug(slug: string, userId: string): Promise<Workspace> {
  const workspaceRepository = await getWorkspaceRepository();
  const workspaceMemberRepository = await getWorkspaceMemberRepository();

  const memberships = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('userId', userId)
  );
  const memberWorkspaceIds = new Set(memberships.map((membership) => membership.workspaceId));

  if (memberWorkspaceIds.size > 0) {
    const candidate = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('slug', slug));
    if (candidate && !candidate.deletedAt && memberWorkspaceIds.has(candidate.id)) {
      return candidate;
    }
  }

  // Not a live slug (or not one this user can access) — check whether it's a previous slug of
  // one of the user's own workspaces (i.e. the workspace was renamed), and redirect to the
  // canonical, current slug if so.
  const redirectRepository = await getWorkspaceSlugRedirectRepository();
  const redirectRows = await redirectRepository.getByQuery(redirectRepository.createQuery().eq('slug', slug));
  const ownRedirect = redirectRows.find((row) => memberWorkspaceIds.has(row.workspaceId));

  if (ownRedirect) {
    const targetWorkspace = await workspaceRepository.getOneByQuery(
      workspaceRepository.createQuery().eq('id', ownRedirect.workspaceId)
    );

    if (targetWorkspace && !targetWorkspace.deletedAt) {
      redirect(await buildRedirectPath(slug, targetWorkspace.slug));
    }
  }

  redirect('/');
}

/**
 * Resolves a sensible "current" workspace for a user with no workspace slug in the URL yet
 * (root `/`, or a legacy bare `/pages/...` link) — used purely to pick a redirect target, not
 * for authorization. Prefers the most recently updated workspace the user belongs to so a user
 * who was last active in a non-default workspace lands back there.
 */
export async function getDefaultWorkspaceForUser(userId: string): Promise<Workspace | undefined> {
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const memberships = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('userId', userId)
  );

  if (memberships.length === 0) {
    return undefined;
  }

  const workspaceRepository = await getWorkspaceRepository();
  const workspaces = await workspaceRepository.getByQuery(
    workspaceRepository.createQuery().in(
      'id',
      memberships.map((membership) => membership.workspaceId)
    )
  );

  const activeWorkspaces = workspaces
    .filter((workspace) => !workspace.deletedAt)
    .toSorted((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));

  return activeWorkspaces[0];
}

/**
 * API-route variant of `getDefaultWorkspaceForUser`: resolves the id of the caller's default
 * workspace (deterministically the most-recently-updated, non-deleted workspace they belong
 * to — same ordering/filtering, so different routes never disagree on which workspace is
 * "default" for the same user), throwing `NotFoundError` instead of returning `undefined` when
 * there isn't one. Shared by every endpoint that falls back to a default workspace when no
 * explicit `workspaceId`/`parentId` was supplied (`pages`, `pages/tree`, `pages/welcome`,
 * `data-sources`, `views`).
 */
export async function resolveDefaultWorkspaceId(userId: string): Promise<string> {
  const workspace = await getDefaultWorkspaceForUser(userId);

  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  return workspace.id;
}

/**
 * Picks the workspace to land a user in when there's no workspace slug in the URL yet (root `/`
 * or a legacy bare `/pages` link): prefers the workspace named by the non-authoritative
 * `thoth_last_workspace` cookie (so the user resumes where they left off), re-validating live
 * membership, and falls back to the most-recently-updated workspace otherwise. Returns
 * `undefined` only when the user has no active workspace at all.
 */
export async function getLandingWorkspaceForUser(userId: string): Promise<Workspace | undefined> {
  const cookieStore = await cookies();
  const lastSlug = cookieStore.get(LAST_WORKSPACE_COOKIE)?.value;

  if (lastSlug) {
    const workspaceRepository = await getWorkspaceRepository();
    const candidate = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('slug', lastSlug));
    if (candidate && !candidate.deletedAt) {
      try {
        await assertWorkspaceAccess(userId, candidate.id);
        return candidate;
      } catch {
        // Cookie is stale (workspace deleted, renamed, or membership lost) — fall through to
        // the default resolution below.
      }
    }
  }

  return getDefaultWorkspaceForUser(userId);
}

/**
 * Resolves the current slug of the workspace a given page (`Container`) belongs to, plus the
 * page's own name (used to build a title-slugged redirect target, THOTH-067), for `userId`. Used
 * by the legacy bare `/pages/[id]` and `/pages/[id]/create` shims to redirect to the correct
 * `/[workspaceSlug]/pages/[id]` URL — the page may belong to *any* of the user's workspaces, not
 * necessarily their default one, so this derives the slug from the page's own `workspaceId`
 * rather than guessing. Returns `undefined` if the page doesn't exist or the user isn't a member
 * of its workspace.
 */
export async function getWorkspaceSlugForContainer(
  containerId: string,
  userId: string
): Promise<{ slug: string; name: string } | undefined> {
  const containerRepository = await getContainerRepository();
  const container = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', containerId));
  if (!container) {
    return undefined;
  }

  try {
    await assertWorkspaceAccess(userId, container.workspaceId);
  } catch {
    return undefined;
  }

  const workspaceRepository = await getWorkspaceRepository();
  const workspace = await workspaceRepository.getOneByQuery(
    workspaceRepository.createQuery().eq('id', container.workspaceId)
  );

  return workspace ? { slug: workspace.slug, name: container.name } : undefined;
}

/**
 * Swaps only the leading `/<oldSlug>` path segment of the current request for `/<newSlug>`,
 * preserving every following segment and the query string untouched.
 */
async function buildRedirectPath(oldSlug: string, newSlug: string): Promise<string> {
  const headersList = await headers();
  const currentPath = headersList.get('x-pathname') ?? `/${oldSlug}`;

  if (
    currentPath === `/${oldSlug}` ||
    currentPath.startsWith(`/${oldSlug}/`) ||
    currentPath.startsWith(`/${oldSlug}?`)
  ) {
    return `/${newSlug}${currentPath.slice(`/${oldSlug}`.length)}`;
  }

  // Fallback (header missing, e.g. in tests): just land on the workspace's default page.
  return `/${newSlug}/pages`;
}
