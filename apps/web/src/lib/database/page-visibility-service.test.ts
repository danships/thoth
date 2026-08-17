import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import { createTestDatabaseFile } from '../../../tests/helpers/create-test-database';
import type { PageContainer } from '@thoth/database/types';

describe('page-visibility-service', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<(typeof import('@/lib/database'))['getContainerRepository']>>;
  let cascadeSetPagePrivate: (typeof import('./page-visibility-service'))['cascadeSetPagePrivate'];
  let excludePrivateContainers: (typeof import('./page-visibility-service'))['excludePrivateContainers'];
  let BadRequestError: (typeof import('@/lib/errors/bad-request-error'))['BadRequestError'];

  const workspaceId = 'workspace-1';
  const userId = 'user-1';

  let counter = 0;

  beforeAll(async () => {
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    mutableEnvironment['NODE_ENV'] = 'test';
    mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
    mutableEnvironment['LOG_LEVEL'] = 'error';

    const { temporaryDirectory: createdDirectory, databaseUrl } =
      await createTestDatabaseFile('thoth-page-visibility-test-');
    temporaryDirectory = createdDirectory;
    mutableEnvironment['DB'] = databaseUrl;

    const databaseModule = await import('@/lib/database');
    const pageVisibilityServiceModule = await import('./page-visibility-service');
    const badRequestErrorModule = await import('@/lib/errors/bad-request-error');

    containerRepository = await databaseModule.getContainerRepository();
    cascadeSetPagePrivate = pageVisibilityServiceModule.cascadeSetPagePrivate;
    excludePrivateContainers = pageVisibilityServiceModule.excludePrivateContainers;
    BadRequestError = badRequestErrorModule.BadRequestError;
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createPage(options: {
    parentId?: string | null;
    isPrivate?: boolean;
    privateRootId?: string | null;
  }): Promise<PageContainer> {
    counter += 1;
    const now = new Date(Date.now() + counter).toISOString();
    const created = await containerRepository.create({
      name: `Test page ${counter}`,
      type: 'page' as const,
      parentId: options.parentId ?? null,
      workspaceId,
      userId,
      emoji: null,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      isPrivate: options.isPrivate ?? false,
      privateRootId: options.privateRootId ?? null,
    } as Parameters<typeof containerRepository.create>[0]);
    return created as PageContainer;
  }

  async function refetch(id: string): Promise<PageContainer> {
    const found = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', id));
    return found as PageContainer;
  }

  describe('excludePrivateContainers', () => {
    test('filters out isPrivate rows, keeping public and undefined-flag rows', () => {
      const result = excludePrivateContainers([
        { id: '1', isPrivate: true },
        { id: '2', isPrivate: false },
        { id: '3' },
      ]);
      expect(result.map((r) => r.id)).toEqual(['2', '3']);
    });
  });

  describe('cascadeSetPagePrivate', () => {
    test('marking a root private cascades to all descendants', async () => {
      const root = await createPage({});
      const child = await createPage({ parentId: root.id });
      const grandchild = await createPage({ parentId: child.id });

      const result = await cascadeSetPagePrivate(root, true, userId);
      expect(result.affectedPageCount).toBe(3);

      const refetchedRoot = await refetch(root.id);
      const refetchedChild = await refetch(child.id);
      const refetchedGrandchild = await refetch(grandchild.id);

      expect(refetchedRoot.isPrivate).toBe(true);
      expect(refetchedRoot.privateRootId).toBe(root.id);
      expect(refetchedChild.isPrivate).toBe(true);
      expect(refetchedChild.privateRootId).toBe(root.id);
      expect(refetchedGrandchild.isPrivate).toBe(true);
      expect(refetchedGrandchild.privateRootId).toBe(root.id);
    });

    test('marking private skips an already-independently-private descendant (root pointer preserved)', async () => {
      const root = await createPage({});
      const independentChild = await createPage({ parentId: root.id, isPrivate: true });
      // Mark it its own root explicitly.
      await containerRepository.update({ ...independentChild, privateRootId: independentChild.id });
      const refetchedIndependentChild = await refetch(independentChild.id);

      const result = await cascadeSetPagePrivate(root, true, userId);
      // Only the root itself is affected; the independently-private descendant is skipped.
      expect(result.affectedPageCount).toBe(1);

      const afterCascade = await refetch(independentChild.id);
      expect(afterCascade.isPrivate).toBe(true);
      expect(afterCascade.privateRootId).toBe(refetchedIndependentChild.privateRootId);
      expect(afterCascade.privateRootId).toBe(independentChild.id);
    });

    test('un-marking a root clears only its own cascaded descendants and leaves unrelated private pages untouched', async () => {
      const root = await createPage({});
      const child = await createPage({ parentId: root.id });
      await cascadeSetPagePrivate(root, true, userId);

      // An unrelated private page elsewhere in the tree, marked independently (its own root).
      const unrelatedRoot = await createPage({});
      await cascadeSetPagePrivate(unrelatedRoot, true, userId);

      const result = await cascadeSetPagePrivate(await refetch(root.id), false, userId);
      expect(result.affectedPageCount).toBe(2);

      const refetchedRoot = await refetch(root.id);
      const refetchedChild = await refetch(child.id);
      const refetchedUnrelated = await refetch(unrelatedRoot.id);

      expect(refetchedRoot.isPrivate).toBe(false);
      expect(refetchedRoot.privateRootId).toBeNull();
      expect(refetchedChild.isPrivate).toBe(false);
      expect(refetchedChild.privateRootId).toBeNull();
      expect(refetchedUnrelated.isPrivate).toBe(true);
      expect(refetchedUnrelated.privateRootId).toBe(unrelatedRoot.id);
    });

    test('attempting to un-mark a non-root cascaded descendant throws BadRequestError', async () => {
      const root = await createPage({});
      const child = await createPage({ parentId: root.id });
      await cascadeSetPagePrivate(root, true, userId);

      const refetchedChild = await refetch(child.id);
      await expect(cascadeSetPagePrivate(refetchedChild, false, userId)).rejects.toThrow(BadRequestError);

      // State is unchanged after the rejected attempt.
      const afterAttempt = await refetch(child.id);
      expect(afterAttempt.isPrivate).toBe(true);
      expect(afterAttempt.privateRootId).toBe(root.id);
    });
  });
});
