import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from '../context.js';
import { getContainerRepository, getDatabase } from '../repositories.js';
import type { PageContainer } from '../types.js';

describe('is-private-backfill', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let backfillIsPrivateFields: (typeof import('./is-private-backfill.js'))['backfillIsPrivateFields'];

  const workspaceId = 'workspace-1';

  let counter = 0;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-is-private-backfill-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');

    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));

    const backfillModule = await import('./is-private-backfill.js');

    containerRepository = await getContainerRepository();
    backfillIsPrivateFields = backfillModule.backfillIsPrivateFields;
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  // Deliberately omits `isPrivate`/`privateRootId` — `create()` is only typed by SuperSave's
  // `EntityDefinition`, not validated against the zod schema (that only happens at the API
  // layer), so this faithfully simulates a pre-existing row written before this migration
  // existed.
  async function createLegacyTestPage(): Promise<PageContainer> {
    counter += 1;
    const created = await containerRepository.create({
      name: `Test page ${counter}`,
      type: 'page' as const,
      parentId: null,
      workspaceId,
      userId: 'user-1',
      emoji: null,
      lastUpdated: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      deletedRootId: null,
    } as unknown as Parameters<typeof containerRepository.create>[0]);
    return created as PageContainer;
  }

  test('backfills isPrivate/privateRootId on a row missing both fields', async () => {
    const created = await createLegacyTestPage();

    const database = await getDatabase();
    await backfillIsPrivateFields(database);

    const refreshed = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', created.id));
    expect(refreshed?.isPrivate).toBe(false);
    expect(refreshed?.privateRootId ?? null).toBeNull();
  });

  test('is idempotent: a second run leaves already-populated rows untouched', async () => {
    const created = await createLegacyTestPage();

    const database = await getDatabase();
    await backfillIsPrivateFields(database);
    const afterFirstRun = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', created.id)
    );
    expect(afterFirstRun?.isPrivate).toBe(false);

    await containerRepository.update({ ...created, isPrivate: true, privateRootId: created.id });
    await backfillIsPrivateFields(database);

    const afterSecondRun = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', created.id)
    );
    expect(afterSecondRun?.isPrivate).toBe(true);
    expect(afterSecondRun?.privateRootId).toBe(created.id);
  });
});
