import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { CreateWelcomePageResponse } from '@/types/api';
import type { PageContainerCreate } from '@/types/database';

// SuperSave has no unique-constraint support, so the check-then-create below cannot be made
// race-safe at the database level. As a mitigation for the common case (double-click, client
// retry), concurrent requests for the same user are serialized in-process via this lock chain.
// Note: this does not protect against races across multiple server instances.
const welcomePageCreationLocks = new Map<string, Promise<unknown>>();

async function withUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = welcomePageCreationLocks.get(userId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  welcomePageCreationLocks.set(userId, tracked);
  try {
    return await run;
  } finally {
    if (welcomePageCreationLocks.get(userId) === tracked) {
      welcomePageCreationLocks.delete(userId);
    }
  }
}

export const POST = apiRoute<CreateWelcomePageResponse, {}, {}, {}>({}, async (_request, session) =>
  withUserLock(session.user.id, async () => {
    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      addUserIdToQuery(workspaceRepository.createQuery(), session.user.id)
    );

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const containerRepository = await getContainerRepository();

    // Idempotency: if a root page already exists, return it instead of creating a duplicate.
    // Note: SuperSave does not return results when filtering with `.eq('parentId', null)`,
    // so root pages are found by fetching all pages and filtering client-side (see the same
    // pattern in `src/app/api/v1/pages/tree/route.ts`).
    const pages = await containerRepository.getByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('type', 'page'), session.user.id)
    );
    const existingRootPage = pages.find((page) => page.type === 'page' && !page.parentId);

    if (existingRootPage && existingRootPage.type === 'page') {
      return {
        id: existingRootPage.id,
        name: existingRootPage.name,
        emoji: existingRootPage.emoji || null,
        parentId: existingRootPage.parentId || null,
        createdAt: existingRootPage.createdAt,
        lastUpdated: existingRootPage.lastUpdated,
      };
    }

    const pageData: PageContainerCreate = {
      name: 'Welcome',
      type: 'page',
      userId: session.user.id,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      workspaceId: workspace.id,
      emoji: '👋',
      parentId: null,
    };

    const createdPage = await containerRepository.create(pageData);

    return {
      id: createdPage.id,
      name: createdPage.name,
      emoji: 'emoji' in createdPage ? createdPage.emoji : null,
      parentId: createdPage.parentId || null,
      createdAt: createdPage.createdAt,
      lastUpdated: createdPage.lastUpdated,
    };
  })
);
