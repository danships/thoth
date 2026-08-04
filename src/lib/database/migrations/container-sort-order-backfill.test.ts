import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import type { PageContainer } from '@/types/database';

describe('container-sort-order-backfill', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<(typeof import('..'))['getContainerRepository']>>;
  let getDatabase: (typeof import('..'))['getDatabase'];
  let backfillContainerSortOrder: (typeof import('./container-sort-order-backfill'))['backfillContainerSortOrder'];

  const workspaceId = 'workspace-1';

  let counter = 0;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-sort-order-backfill-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    mutableEnvironment['NODE_ENV'] = 'test';
    mutableEnvironment['DB'] = `sqlite://${databaseFile}`;
    mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
    mutableEnvironment['LOG_LEVEL'] = 'error';
    // Skip the built-in migration runner (which already includes this backfill) so the test can
    // invoke `backfillContainerSortOrder` directly and control exactly when it runs relative to
    // seeded rows.
    mutableEnvironment['SUPERSAVE_SKIP_SYNC'] = 'false';

    const databaseModule = await import('..');
    const backfillModule = await import('./container-sort-order-backfill');

    containerRepository = await databaseModule.getContainerRepository();
    getDatabase = databaseModule.getDatabase;
    backfillContainerSortOrder = backfillModule.backfillContainerSortOrder;
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createTestPage(options: {
    parentId: string | null;
    lastUpdated: string;
    sortOrder?: string | null;
  }): Promise<PageContainer> {
    counter += 1;
    const created = await containerRepository.create({
      name: `Test page ${counter}`,
      type: 'page' as const,
      parentId: options.parentId,
      workspaceId,
      userId: 'user-1',
      emoji: null,
      lastUpdated: options.lastUpdated,
      createdAt: options.lastUpdated,
      deletedAt: null,
      deletedRootId: null,
      ...(options.sortOrder === undefined ? {} : { sortOrder: options.sortOrder }),
    } as Parameters<typeof containerRepository.create>[0]);
    return created as PageContainer;
  }

  test('seeds ascending sortOrder keys per parented group ordered by lastUpdated desc', async () => {
    const parentId = 'parent-a';
    const oldest = await createTestPage({ parentId, lastUpdated: '2024-01-01T00:00:00.000Z' });
    const middle = await createTestPage({ parentId, lastUpdated: '2024-01-02T00:00:00.000Z' });
    const newest = await createTestPage({ parentId, lastUpdated: '2024-01-03T00:00:00.000Z' });

    const database = await getDatabase();
    await backfillContainerSortOrder(database);

    const refreshed = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('parentId', parentId).sort('sortOrder', 'asc')
    );

    // The most-recently-updated row (previous default child order: `lastUpdated desc`) should
    // come first in the new manual (`sortOrder asc`) order, so the post-migration order is a
    // no-op reshuffle for existing users.
    expect(refreshed.map((container) => container.id)).toEqual([newest.id, middle.id, oldest.id]);

    const keys = refreshed.map((container) => container.sortOrder);
    expect(keys.every((key) => typeof key === 'string' && key.length > 0)).toBe(true);
    const sortedKeys = keys.toSorted();
    expect(keys).toEqual(sortedKeys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('skips root rows (parentId == null)', async () => {
    const root = await createTestPage({ parentId: null, lastUpdated: '2024-01-01T00:00:00.000Z' });

    const database = await getDatabase();
    await backfillContainerSortOrder(database);

    const refreshed = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', root.id));
    expect(refreshed?.sortOrder ?? null).toBeNull();
  });

  test('is idempotent: a second run leaves already-populated rows untouched', async () => {
    const parentId = 'parent-b';
    const first = await createTestPage({ parentId, lastUpdated: '2024-01-01T00:00:00.000Z' });
    const second = await createTestPage({ parentId, lastUpdated: '2024-01-02T00:00:00.000Z' });

    const database = await getDatabase();
    await backfillContainerSortOrder(database);

    const afterFirstRun = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('parentId', parentId).sort('sortOrder', 'asc')
    );
    const keysAfterFirstRun = afterFirstRun.map((container) => container.sortOrder);

    // Add a new sibling with no sortOrder, then re-run — only the new row should be seeded, the
    // existing two must keep their exact prior keys.
    const third = await createTestPage({ parentId, lastUpdated: '2024-01-03T00:00:00.000Z' });
    await backfillContainerSortOrder(database);

    const afterSecondRun = await containerRepository.getByQuery(
      containerRepository.createQuery().eq('parentId', parentId).sort('sortOrder', 'asc')
    );

    const firstRefetched = afterSecondRun.find((container) => container.id === first.id);
    const secondRefetched = afterSecondRun.find((container) => container.id === second.id);
    const thirdRefetched = afterSecondRun.find((container) => container.id === third.id);

    expect(afterFirstRun.map((container) => container.id)).toContain(first.id);
    expect(afterFirstRun.map((container) => container.id)).toContain(second.id);
    expect(keysAfterFirstRun).toContain(firstRefetched?.sortOrder);
    expect(keysAfterFirstRun).toContain(secondRefetched?.sortOrder);
    expect(thirdRefetched?.sortOrder).toBeTruthy();
  });

  test('includes soft-deleted rows', async () => {
    const parentId = 'parent-c';
    const deleted = await createTestPage({ parentId, lastUpdated: '2024-01-01T00:00:00.000Z' });
    await containerRepository.update({
      ...deleted,
      deletedAt: '2024-01-05T00:00:00.000Z',
      deletedRootId: deleted.id,
    });

    const database = await getDatabase();
    await backfillContainerSortOrder(database);

    const refreshed = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', deleted.id));
    expect(refreshed?.sortOrder ?? null).not.toBeNull();
  });
});
