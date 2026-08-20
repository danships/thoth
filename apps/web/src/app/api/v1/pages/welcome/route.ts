import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { registerContainerAccessForNewPage } from '@/lib/database/container-access-service';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { assertGrantAllowsWrite, grantAllowsContainer, memberToAccessGrant } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { schedulePageSearchSync } from '@/lib/search/notify-service';
import type { CreateWelcomePageBody, CreateWelcomePageResponse } from '@/types/api';
import { createWelcomePageBodySchema } from '@/types/api';
import type { PageContainerCreate } from '@thoth/database/types';

// SuperSave has no unique-constraint support, so the check-then-create below cannot be made
// race-safe at the database level. As a mitigation for the common case (double-click, client
// retry), concurrent requests for the same user+workspace are serialized in-process via this
// lock chain. Note: this does not protect against races across multiple server instances.
const welcomePageCreationLocks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = welcomePageCreationLocks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  welcomePageCreationLocks.set(key, tracked);
  try {
    return await run;
  } finally {
    if (welcomePageCreationLocks.get(key) === tracked) {
      welcomePageCreationLocks.delete(key);
    }
  }
}

export const POST = apiRoute<CreateWelcomePageResponse, {}, {}, CreateWelcomePageBody>(
  {
    expectedBodySchema: createWelcomePageBodySchema,
  },
  async ({ body }, session) => {
    // No existing entity to derive the workspace from — `workspaceId` (falling back to the
    // caller's default workspace for backwards compatibility) is required and validated here.
    let workspaceId = body?.workspaceId;
    if (!workspaceId) {
      workspaceId = await resolveDefaultWorkspaceId(session.user.id);
    }
    const member = await assertWorkspaceAccess(session.user.id, workspaceId);
    // Resolve the caller's unified AccessGrant (THOTH-042) once up front, so both the
    // idempotency lookup below (read scope) and the create path (write permission) are gated by
    // it — a read-only-scoped member/App must not be able to create a welcome page, nor be
    // handed back one it can't otherwise read.
    const grant = session.appContext ? session.appContext.accessGrant : await memberToAccessGrant(member);

    return withLock(`${session.user.id}:${workspaceId}`, async () => {
      const workspaceRepository = await getWorkspaceRepository();
      const workspace = await workspaceRepository.getOneByQuery(
        workspaceRepository.createQuery().eq('id', workspaceId)
      );

      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const containerRepository = await getContainerRepository();

      // Idempotency: if a root page already exists *in this workspace*, return it instead of
      // creating a duplicate. Scoped by `workspaceId` — without this, creating a second
      // workspace could silently return the first workspace's welcome page instead of creating
      // a new one (see THOTH-027).
      // Note: SuperSave does not return results when filtering with `.eq('parentId', null)`,
      // so root pages are found by fetching all pages and filtering client-side (see the same
      // pattern in `src/app/api/v1/pages/tree/route.ts`).
      const pages = await containerRepository.getByQuery(
        addWorkspaceIdToQuery(containerRepository.createQuery().eq('type', 'page'), workspace.id)
      );
      const existingRootPage = pages.find((page) => page.type === 'page' && !page.parentId && !page.deletedAt);

      if (
        existingRootPage &&
        existingRootPage.type === 'page' &&
        (await grantAllowsContainer(grant, existingRootPage))
      ) {
        return {
          id: existingRootPage.id,
          name: existingRootPage.name,
          emoji: existingRootPage.emoji || null,
          parentId: existingRootPage.parentId || null,
          sortOrder: existingRootPage.sortOrder ?? null,
          isPrivate: existingRootPage.isPrivate,
          privateRootId: existingRootPage.privateRootId ?? null,
          createdAt: existingRootPage.createdAt,
          lastUpdated: existingRootPage.lastUpdated,
        };
      }

      // Read-only-scoped members/Apps cannot create a new welcome page either — reachable both
      // when there's no existing root page yet and when one exists but is outside the caller's
      // scope (handled above).
      assertGrantAllowsWrite(grant);

      const pageData: PageContainerCreate = {
        name: 'Welcome',
        type: 'page',
        userId: session.user.id,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        workspaceId: workspace.id,
        emoji: '👋',
        parentId: null,
        deletedAt: null,
        deletedRootId: null,
        isPrivate: false,
        privateRootId: null,
      };

      const createdPage = await containerRepository.create(pageData);

      // Ensure the welcome page also appears in the ContainerAccess-driven root list from the
      // moment it's created (see `registerContainerAccessForNewPage`).
      await registerContainerAccessForNewPage(createdPage, session.user.id);
      schedulePageSearchSync(createdPage);

      return {
        id: createdPage.id,
        name: createdPage.name,
        emoji: 'emoji' in createdPage ? createdPage.emoji : null,
        parentId: createdPage.parentId || null,
        sortOrder: 'sortOrder' in createdPage ? (createdPage.sortOrder ?? null) : null,
        isPrivate: createdPage.isPrivate,
        privateRootId: createdPage.privateRootId ?? null,
        createdAt: createdPage.createdAt,
        lastUpdated: createdPage.lastUpdated,
      };
    });
  }
);
