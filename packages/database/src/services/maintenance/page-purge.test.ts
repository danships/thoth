import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from '../../context.js';
import { getContainerRepository, getDataViewRepository, getContainerAccessRepository } from '../../repositories.js';
import { selectPurgeableDeletedRoots, permanentlyDeleteDeletedRoot } from './page-purge.js';
import type { PageContainer, DataView } from '../../types.js';

describe('page-purge', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let dataViewRepository: Awaited<ReturnType<typeof getDataViewRepository>>;
  let containerAccessRepository: Awaited<ReturnType<typeof getContainerAccessRepository>>;
  let counter = 0;

  const workspaceId = 'workspace-1';
  const OLD_ISO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const RECENT_ISO = new Date(Date.now() - 1000).toISOString();
  const graceThresholdMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-page-purge-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));
    containerRepository = await getContainerRepository();
    dataViewRepository = await getDataViewRepository();
    containerAccessRepository = await getContainerAccessRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createPage(options: {
    userId?: string;
    parentId?: string | null;
    deletedAt?: string | null;
    deletedRootId?: string | null;
    lastUpdated?: string;
  }): Promise<PageContainer> {
    counter += 1;
    const now = new Date().toISOString();
    const created = await containerRepository.create({
      name: `Page ${counter}`,
      type: 'page',
      parentId: options.parentId ?? null,
      workspaceId,
      userId: options.userId ?? 'creator-1',
      emoji: null,
      lastUpdated: options.lastUpdated ?? now,
      createdAt: now,
      deletedAt: options.deletedAt ?? null,
      deletedRootId: options.deletedRootId ?? null,
      sortOrder: null,
      values: {},
      views: [],
    } as Parameters<typeof containerRepository.create>[0]);
    return created as PageContainer;
  }

  async function createDataView(options: { deletedAt?: string | null; deletedRootId?: string | null }): Promise<DataView> {
    counter += 1;
    const now = new Date().toISOString();
    return dataViewRepository.create({
      name: `View ${counter}`,
      dataSourceId: 'ds-1',
      workspaceId,
      userId: 'creator-1',
      columns: [],
      filters: [],
      sorts: [],
      columnLayout: null,
      deletedAt: options.deletedAt ?? null,
      deletedRootId: options.deletedRootId ?? null,
      createdAt: now,
      lastUpdated: now,
    } as Parameters<typeof dataViewRepository.create>[0]);
  }

  describe('selectPurgeableDeletedRoots', () => {
    test('selects only deleted roots past grace/race, across containers and data-views', async () => {
      const eligibleRoot = await createPage({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await containerRepository.update({ ...eligibleRoot, deletedRootId: eligibleRoot.id });

      const eligibleView = await createDataView({ deletedAt: OLD_ISO });
      await dataViewRepository.update({ ...eligibleView, deletedRootId: eligibleView.id, lastUpdated: OLD_ISO });

      await createPage({}); // not deleted
      const tooRecent = await createPage({ deletedAt: RECENT_ISO, lastUpdated: RECENT_ISO });
      await containerRepository.update({ ...tooRecent, deletedRootId: tooRecent.id });

      // A cascaded descendant (deletedRootId points elsewhere) is not itself a root.
      const descendant = await createPage({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO, deletedRootId: eligibleRoot.id });
      void descendant;

      const batch = await selectPurgeableDeletedRoots({ graceThresholdMs, nowMs: Date.now(), limit: 100, offset: 0 });
      const ids = batch.candidates.map((candidate) => candidate.id);
      expect(ids).toContain(eligibleRoot.id);
      expect(ids).toContain(eligibleView.id);
      expect(ids).not.toContain(tooRecent.id);
      expect(ids).not.toContain(descendant.id);
    });
  });

  describe('permanentlyDeleteDeletedRoot', () => {
    test('deletes a root and its cascaded descendants regardless of creator userId', async () => {
      const root = await createPage({ userId: 'user-a', deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await containerRepository.update({ ...root, deletedRootId: root.id });

      // Descendant created by a *different* user than the root — must still be purged, since
      // content deletion is scoped by workspace/root, never creator (THOTH-042/THOTH-063).
      const descendant = await createPage({
        userId: 'user-b',
        parentId: root.id,
        deletedAt: OLD_ISO,
        lastUpdated: OLD_ISO,
        deletedRootId: root.id,
      });

      await containerAccessRepository.create({
        containerId: root.id,
        parentId: null,
        workspaceId,
        userId: 'user-c',
        lastAccessedAt: OLD_ISO,
        starred: false,
        starredAt: null,
        createdAt: OLD_ISO,
      } as Parameters<typeof containerAccessRepository.create>[0]);

      const outcome = await permanentlyDeleteDeletedRoot(root.id, workspaceId, graceThresholdMs);
      expect(outcome.status).toBe('purged');
      if (outcome.status !== 'purged') {
        throw new Error('expected purged');
      }
      expect(outcome.deletedContainerIds.sort()).toEqual([descendant.id, root.id].sort());

      expect(await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', root.id))).toBeFalsy();
      expect(
        await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', descendant.id))
      ).toBeFalsy();

      // Idempotent rerun.
      const secondOutcome = await permanentlyDeleteDeletedRoot(root.id, workspaceId, graceThresholdMs);
      expect(secondOutcome.status).toBe('skipped');
    });

    test('skips a root restored since the scan', async () => {
      const root = await createPage({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await containerRepository.update({ ...root, deletedRootId: root.id });
      await containerRepository.update({ ...root, deletedAt: null, deletedRootId: null });

      const outcome = await permanentlyDeleteDeletedRoot(root.id, workspaceId, graceThresholdMs);
      expect(outcome.status).toBe('skipped');
      expect(await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', root.id))).toBeTruthy();
    });

    test('deletes a data-view root', async () => {
      const view = await createDataView({ deletedAt: OLD_ISO });
      await dataViewRepository.update({ ...view, deletedRootId: view.id, lastUpdated: OLD_ISO });

      const outcome = await permanentlyDeleteDeletedRoot(view.id, workspaceId, graceThresholdMs);
      expect(outcome.status).toBe('purged');
      expect(await dataViewRepository.getOneByQuery(dataViewRepository.createQuery().eq('id', view.id))).toBeFalsy();
    });

    test('deletes data-views cascaded from a container root (regression: entity-type gating bug)', async () => {
      // A container root whose cascaded views (deletedRootId === root.id) must be purged too —
      // previously the cascaded-data-view query was only run when the root *itself* was a
      // DataView, silently leaving these rows behind forever.
      const root = await createPage({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await containerRepository.update({ ...root, deletedRootId: root.id });

      const cascadedView = await createDataView({ deletedAt: OLD_ISO, deletedRootId: root.id });
      await dataViewRepository.update({ ...cascadedView, lastUpdated: OLD_ISO });

      const outcome = await permanentlyDeleteDeletedRoot(root.id, workspaceId, graceThresholdMs);
      expect(outcome.status).toBe('purged');
      if (outcome.status !== 'purged') {
        throw new Error('expected purged');
      }
      expect(outcome.deletedViewIds).toEqual([cascadedView.id]);
      expect(
        await dataViewRepository.getOneByQuery(dataViewRepository.createQuery().eq('id', cascadedView.id))
      ).toBeFalsy();
    });

    test('preserves ContainerAccess for a container that survives the purge race', async () => {
      // A container whose `deletedAt` gets cleared (restored) between candidate selection and
      // the per-container delete loop must keep its ContainerAccess row — deleting access rows
      // eagerly for every candidate up front (before the per-container re-check) would destroy
      // state for a container that in fact survives.
      const root = await createPage({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await containerRepository.update({ ...root, deletedRootId: root.id });

      const survivor = await createPage({
        parentId: root.id,
        deletedAt: OLD_ISO,
        lastUpdated: OLD_ISO,
        deletedRootId: root.id,
      });
      await containerAccessRepository.create({
        containerId: survivor.id,
        parentId: null,
        workspaceId,
        userId: 'user-d',
        lastAccessedAt: OLD_ISO,
        starred: true,
        starredAt: OLD_ISO,
        createdAt: OLD_ISO,
      } as Parameters<typeof containerAccessRepository.create>[0]);

      // Simulate a concurrent restore of `survivor` right before the delete loop runs by
      // clearing its `deletedAt` immediately after candidate collection would have happened.
      await containerRepository.update({ ...survivor, deletedAt: null, deletedRootId: null });

      const outcome = await permanentlyDeleteDeletedRoot(root.id, workspaceId, graceThresholdMs);
      expect(outcome.status).toBe('purged');
      if (outcome.status !== 'purged') {
        throw new Error('expected purged');
      }
      expect(outcome.deletedContainerIds).toEqual([root.id]);

      const survivorAccessRows = await containerAccessRepository.getByQuery(
        containerAccessRepository.createQuery().eq('containerId', survivor.id)
      );
      expect(survivorAccessRows).toHaveLength(1);
    });
  });
});
