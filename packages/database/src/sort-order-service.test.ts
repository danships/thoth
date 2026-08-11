import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from './context';
import { getContainerRepository } from './repositories';
import type { PageContainer } from './types';

describe('sort-order-service', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let getMaxSiblingSortOrder: (typeof import('./sort-order-service'))['getMaxSiblingSortOrder'];
  let computeReorderKey: (typeof import('./sort-order-service'))['computeReorderKey'];
  let rebalanceSiblingGroup: (typeof import('./sort-order-service'))['rebalanceSiblingGroup'];

  const workspaceId = 'workspace-1';
  const parentId = 'parent-1';

  let counter = 0;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-sort-order-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');

    // Explicit, isolated context (skipSync so SuperSave creates the schema for this fresh temp
    // file directly) — no environment variables, no shared/module-level default beyond this
    // test file's own registration.
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));

    const sortOrderServiceModule = await import('./sort-order-service');

    containerRepository = await getContainerRepository();
    getMaxSiblingSortOrder = sortOrderServiceModule.getMaxSiblingSortOrder;
    computeReorderKey = sortOrderServiceModule.computeReorderKey;
    rebalanceSiblingGroup = sortOrderServiceModule.rebalanceSiblingGroup;
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });


  async function createTestPage(
    options: { parentId?: string; sortOrder?: string | null } = {}
  ): Promise<PageContainer> {
    counter += 1;
    const now = new Date(Date.now() + counter).toISOString();
    const created = await containerRepository.create({
      name: `Test page ${counter}`,
      type: 'page' as const,
      parentId: options.parentId ?? parentId,
      workspaceId,
      userId: 'user-1',
      emoji: null,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      sortOrder: options.sortOrder ?? null,
    } as Parameters<typeof containerRepository.create>[0]);
    return created as PageContainer;
  }

  describe('getMaxSiblingSortOrder', () => {
    test('returns null for an empty group', async () => {
      const result = await getMaxSiblingSortOrder(workspaceId, 'empty-group');
      expect(result).toBeNull();
    });

    test('returns the lexicographic max sortOrder in the group', async () => {
      const group = 'max-group';
      await createTestPage({ parentId: group, sortOrder: 'a0' });
      await createTestPage({ parentId: group, sortOrder: 'a2' });
      await createTestPage({ parentId: group, sortOrder: 'a1' });

      const result = await getMaxSiblingSortOrder(workspaceId, group);
      expect(result).toBe('a2');
    });
  });

  describe('computeReorderKey', () => {
    test('generates a key strictly between two anchors', async () => {
      const group = 'between-group';
      const key = await computeReorderKey({
        workspaceId,
        parentId: group,
        movedId: 'moved-page',
        beforeKey: 'a0',
        afterKey: 'a1',
      });
      expect(key > 'a0').toBe(true);
      expect(key < 'a1').toBe(true);
    });

    test('generates an end-of-list key when both anchors are open', async () => {
      const group = 'open-ends-group';
      const key = await computeReorderKey({
        workspaceId,
        parentId: group,
        movedId: 'moved-page',
        beforeKey: null,
        afterKey: null,
      });
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    test('rebalances the group and returns a valid key on collision', async () => {
      const group = 'collision-group';
      // Duplicate `sortOrder` values (e.g. from a prior race) make `before >= after`, which
      // `generateKeyBetween` itself throws for — this forces the rebalance path.
      const before = await createTestPage({ parentId: group, sortOrder: 'a0' });
      const after = await createTestPage({ parentId: group, sortOrder: 'a0' });
      const moved = await createTestPage({ parentId: group, sortOrder: 'a1' });

      const key = await computeReorderKey({
        workspaceId,
        parentId: group,
        movedId: moved.id,
        beforeId: before.id,
        beforeKey: before.sortOrder ?? null,
        afterId: after.id,
        afterKey: after.sortOrder ?? null,
      });

      // The group must have been rebalanced to strictly ascending, unique keys.
      const rebalanced = await containerRepository.getByQuery(
        containerRepository.createQuery().eq('workspaceId', workspaceId).eq('parentId', group).sort('sortOrder', 'asc')
      );
      const keys = rebalanced.map((container) => container.sortOrder);
      const sortedKeys = keys.toSorted();
      expect(keys).toEqual(sortedKeys);
      expect(new Set(keys).size).toBe(keys.length);
      expect(typeof key).toBe('string');
    });
  });

  describe('rebalanceSiblingGroup', () => {
    test('produces strictly ascending, unique keys preserving prior order', async () => {
      const group = 'rebalance-group';
      const first = await createTestPage({ parentId: group, sortOrder: 'a0' });
      const second = await createTestPage({ parentId: group, sortOrder: 'a1' });
      const third = await createTestPage({ parentId: group, sortOrder: 'a2' });

      const rebalanced = await rebalanceSiblingGroup(workspaceId, group);

      expect(rebalanced.map((container) => container.id)).toEqual([first.id, second.id, third.id]);

      const keys = rebalanced.map((container) => container.sortOrder);
      for (let index = 1; index < keys.length; index++) {
        expect((keys[index] ?? '') > (keys[index - 1] ?? '')).toBe(true);
      }
    });

    test('returns an empty array for an empty group', async () => {
      const result = await rebalanceSiblingGroup(workspaceId, 'never-populated-group');
      expect(result).toEqual([]);
    });
  });
});
