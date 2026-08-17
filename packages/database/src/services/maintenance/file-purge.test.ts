import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from '../../context.js';
import { getContainerRepository, getFileUsageRepository, getUploadedFileRepository } from '../../repositories.js';
import { pruneDanglingFileUsages, selectOrphanFileCandidates, purgeOrphanFile } from './file-purge.js';
import type { PageContainer, UploadedFile } from '../../types.js';

describe('file-purge', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let fileUsageRepository: Awaited<ReturnType<typeof getFileUsageRepository>>;
  let uploadedFileRepository: Awaited<ReturnType<typeof getUploadedFileRepository>>;
  let counter = 0;

  const workspaceId = 'workspace-1';
  const OLD_ISO = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const RECENT_ISO = new Date(Date.now() - 1000).toISOString();
  const graceThresholdMs = Date.now() - 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-file-purge-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));
    containerRepository = await getContainerRepository();
    fileUsageRepository = await getFileUsageRepository();
    uploadedFileRepository = await getUploadedFileRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createPage(): Promise<PageContainer> {
    counter += 1;
    const now = new Date().toISOString();
    return containerRepository.create({
      name: `Page ${counter}`,
      type: 'page',
      parentId: null,
      workspaceId,
      userId: 'user-1',
      emoji: null,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
      sortOrder: null,
      values: {},
      views: [],
    } as Parameters<typeof containerRepository.create>[0]) as Promise<PageContainer>;
  }

  async function createFile(createdAt: string): Promise<UploadedFile> {
    counter += 1;
    return uploadedFileRepository.create({
      filename: `file-${counter}.png`,
      mimeType: 'image/png',
      size: 10,
      extension: 'png',
      storageKey: `key-${counter}`,
      storageType: 'local',
      billingUserId: 'user-1',
      workspaceId,
      userId: 'user-1',
      createdAt,
      lastUpdated: createdAt,
    } as Parameters<typeof uploadedFileRepository.create>[0]);
  }

  describe('pruneDanglingFileUsages', () => {
    test('prunes usage rows whose container no longer exists, keeping live-file ids', async () => {
      const page = await createPage();
      const file1 = await createFile(OLD_ISO);
      const file2 = await createFile(OLD_ISO);

      await fileUsageRepository.create({
        fileId: file1.id,
        containerId: page.id,
        workspaceId,
        userId: 'user-1',
        createdAt: OLD_ISO,
      } as Parameters<typeof fileUsageRepository.create>[0]);

      await fileUsageRepository.create({
        fileId: file2.id,
        containerId: 'missing-container',
        workspaceId,
        userId: 'user-1',
        createdAt: OLD_ISO,
      } as Parameters<typeof fileUsageRepository.create>[0]);

      const result = await pruneDanglingFileUsages();
      expect(result.prunedCount).toBe(1);
      expect(result.liveFileIds.has(file1.id)).toBe(true);
      expect(result.liveFileIds.has(file2.id)).toBe(false);

      const remaining = await fileUsageRepository.getByQuery(fileUsageRepository.createQuery().eq('containerId', page.id));
      expect(remaining).toHaveLength(1);
    });
  });

  describe('selectOrphanFileCandidates', () => {
    test('selects only orphaned files past the grace period', async () => {
      const live = await createFile(OLD_ISO);
      const orphanOld = await createFile(OLD_ISO);
      const orphanRecent = await createFile(RECENT_ISO);

      const batch = await selectOrphanFileCandidates({
        liveFileIds: new Set([live.id]),
        graceThresholdMs,
        limit: 100,
        offset: 0,
      });

      const ids = batch.candidates.map((file) => file.id);
      expect(ids).toContain(orphanOld.id);
      expect(ids).not.toContain(live.id);
      expect(ids).not.toContain(orphanRecent.id);
    });
  });

  describe('purgeOrphanFile', () => {
    test('deletes storage bytes then the DB row', async () => {
      const file = await createFile(OLD_ISO);
      const deletedKeys: string[] = [];

      const outcome = await purgeOrphanFile(file, async (key) => {
        deletedKeys.push(key);
      });

      expect(outcome.status).toBe('purged');
      expect(deletedKeys).toEqual([file.storageKey]);
      expect(await uploadedFileRepository.getOneByQuery(uploadedFileRepository.createQuery().eq('id', file.id))).toBeFalsy();
    });

    test('skips a file that gained usage since the scan', async () => {
      const page = await createPage();
      const file = await createFile(OLD_ISO);
      await fileUsageRepository.create({
        fileId: file.id,
        containerId: page.id,
        workspaceId,
        userId: 'user-1',
        createdAt: new Date().toISOString(),
      } as Parameters<typeof fileUsageRepository.create>[0]);

      const outcome = await purgeOrphanFile(file, async () => {
        throw new Error('should not be called');
      });

      expect(outcome.status).toBe('skipped');
      expect(await uploadedFileRepository.getOneByQuery(uploadedFileRepository.createQuery().eq('id', file.id))).toBeTruthy();
    });

    test('keeps the DB row when storage deletion fails, for retry later', async () => {
      const file = await createFile(OLD_ISO);

      const outcome = await purgeOrphanFile(file, async () => {
        throw new Error('disk unavailable');
      });

      expect(outcome.status).toBe('retry-later');
      expect(await uploadedFileRepository.getOneByQuery(uploadedFileRepository.createQuery().eq('id', file.id))).toBeTruthy();
    });
  });
});
