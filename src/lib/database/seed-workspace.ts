import { randomUUID } from 'node:crypto';
import { getContainerRepository, getWorkspaceMemberRepository, getWorkspaceRepository } from './index';
import { registerContainerAccessForNewPage } from './container-access-service';
import { generateUniqueWorkspaceSlug, reserveWorkspaceSlug } from './workspace-slug';
import { ConflictError } from '../errors/conflict-error';
import { slugify } from '../utils/slug';
import type { PageContainerCreate, WorkspaceCreate, WorkspaceMemberCreate } from '@/types/database';

type CreateWorkspaceOptions = {
  slug?: string;
  nameOverride?: string;
  // When `strict` is true (default, used by `POST /workspaces` where a user typed an explicit
  // slug), a collision throws `ConflictError`. When false (used by the signup hook's generated
  // nerdy slug), a collision is silently de-duplicated with `-2`, `-3`, ... instead.
  strict?: boolean;
};

/**
 * Builds the BlockNote `PartialBlock[]` content for a newly created workspace's Welcome page,
 * explaining the workspace concept and interpolating the actual name/slug.
 */
function buildWelcomeBlocks(name: string, slug: string) {
  return [
    {
      type: 'heading',
      props: { level: 1 },
      content: '👋 About this workspace',
    },
    {
      type: 'paragraph',
      content:
        'Workspaces keep your pages, data sources, and views organized into separate, isolated spaces. ' +
        'Create as many as you like — for different projects, teams, or parts of your life — and switch ' +
        'between them anytime using the workspace switcher in the sidebar.',
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This workspace is called ', styles: {} },
        { type: 'text', text: name, styles: { bold: true } },
        { type: 'text', text: ' and lives at ', styles: {} },
        { type: 'text', text: `/${slug}`, styles: { bold: true } },
        {
          type: 'text',
          text: '. You can rename it, or change its URL slug, anytime from Workspace Settings — none of your pages or data will be affected.',
          styles: {},
        },
      ],
    },
    {
      type: 'bulletListItem',
      content: 'Rename this workspace or its URL from Settings',
    },
    {
      type: 'bulletListItem',
      content: 'Create a new workspace from the switcher at any time',
    },
    {
      type: 'bulletListItem',
      content:
        'Deleted workspaces are kept for 30 days before being permanently removed, so you can always restore one you delete by mistake.',
    },
  ];
}

/**
 * Single source of truth for creating a new workspace for a user: reserves the slug, creates
 * the `Workspace` row, the owning `WorkspaceMember` row, and a default "Welcome" page. Used by
 * both the signup hook (`src/lib/auth/config.ts`) and `POST /api/v1/workspaces`.
 */
export async function createWorkspaceForUser(
  userId: string,
  displayName: string,
  options: CreateWorkspaceOptions = {}
) {
  const name = options.nameOverride ?? displayName;
  const baseSlugSource = options.slug ?? slugify(displayName || 'my-workspace');

  const now = new Date().toISOString();

  const workspaceRepository = await getWorkspaceRepository();
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const containerRepository = await getContainerRepository();

  // Creates the Workspace row, its owning membership, and the seeded Welcome page for a slug
  // that has already been reserved. Kept as a closure so it can run *inside* the slug
  // reservation lock, making the check-then-write atomic per slug.
  const createWithSlug = async (slug: string) => {
    const workspace = await workspaceRepository.create({
      name,
      slug,
      userId,
      deletedAt: null,
      createdAt: now,
      lastUpdated: now,
    } satisfies WorkspaceCreate);

    await workspaceMemberRepository.create({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
      createdAt: now,
    } satisfies WorkspaceMemberCreate);

    const pageData: PageContainerCreate = {
      name: 'Welcome',
      type: 'page',
      userId,
      createdAt: now,
      lastUpdated: now,
      workspaceId: workspace.id,
      emoji: '👋',
      parentId: null,
      blocks: buildWelcomeBlocks(workspace.name, workspace.slug),
    };
    // BlockNote block ids are generated client-side normally; stamp a stable id server-side too
    // so the seeded content round-trips through the editor without complaint.
    pageData.blocks = pageData.blocks?.map((block: Record<string, unknown>) => ({ id: randomUUID(), ...block }));

    const createdPage = await containerRepository.create(pageData);
    await registerContainerAccessForNewPage(createdPage, userId);

    return workspace;
  };

  // If the caller supplied an explicit slug (e.g. from POST /workspaces), reserve exactly that
  // one and surface a 409 on collision by default — creating the workspace *inside* the lock so
  // the check-then-write can't race another creation of the same slug. When `strict: false`
  // (signup's generated nerdy slug), fall back to de-duplication instead, retrying on the rare
  // lost race — no user-facing form to reject there.
  if (options.slug && options.strict !== false) {
    return reserveWorkspaceSlug(baseSlugSource, () => createWithSlug(baseSlugSource));
  }

  // Non-strict path: generate a unique slug and create atomically under the lock, retrying with
  // a freshly-generated slug if a concurrent creation claimed it in between.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await generateUniqueWorkspaceSlug(baseSlugSource);
    try {
      return await reserveWorkspaceSlug(candidate, () => createWithSlug(candidate));
    } catch (error) {
      if (error instanceof ConflictError && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable in practice (the loop either returns or throws), but satisfies the type checker.
  throw new ConflictError('Unable to reserve a unique workspace slug');
}
