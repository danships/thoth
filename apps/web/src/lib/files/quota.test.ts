import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { setupTestDatabase } from '@/lib/test-utils/database';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';

describe('assertWithinStorageQuotas', () => {
  let cleanup: () => Promise<void>;
  let database: typeof import('@/lib/database');
  let assertWithinStorageQuotas: (typeof import('./quota'))['assertWithinStorageQuotas'];
  let setSetting: (typeof import('@/lib/settings/service'))['setSetting'];
  let deleteSetting: (typeof import('@/lib/settings/service'))['deleteSetting'];

  const workspaceId = 'ws-quota';
  const otherWorkspaceId = 'ws-other';
  const billingUserId = 'user-quota';

  let fileCounter = 0;

  async function addFile(size: number, options: { workspaceId?: string; billingUserId?: string } = {}) {
    fileCounter += 1;
    const repository = await database.getUploadedFileRepository();
    const now = new Date().toISOString();
    await repository.create({
      filename: `file-${fileCounter}.bin`,
      mimeType: 'application/octet-stream',
      size,
      extension: 'bin',
      storageKey: `key-${fileCounter}`,
      storageType: 'memory',
      workspaceId: options.workspaceId ?? workspaceId,
      userId: options.billingUserId ?? billingUserId,
      billingUserId: options.billingUserId ?? billingUserId,
      createdAt: now,
      lastUpdated: now,
    } as Parameters<typeof repository.create>[0]);
  }

  beforeAll(async () => {
    const setup = await setupTestDatabase('quota-service');
    cleanup = setup.cleanup;
    database = setup.database;
    const quotaModule = await import('./quota');
    assertWithinStorageQuotas = quotaModule.assertWithinStorageQuotas;
    const service = await import('@/lib/settings/service');
    setSetting = service.setSetting;
    deleteSetting = service.deleteSetting;
  });

  afterEach(async () => {
    // Reset all quota settings between tests so scopes don't leak.
    await deleteSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId });
    await deleteSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: billingUserId });
    await deleteSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'platform' });
    // Remove all uploaded files.
    const repository = await database.getUploadedFileRepository();
    const files = await repository.getByQuery(repository.createQuery());
    for (const file of files) {
      await repository.deleteUsingId(file.id);
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  test('allows uploads when all applicable limits are null', async () => {
    // workspace default is DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES; explicitly set null for this ws.
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, null);
    await expect(
      assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 10_000_000 })
    ).resolves.toBeUndefined();
  });

  test('enforces the workspace limit', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, 100);
    await addFile(60);
    await expect(assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 50 })).rejects.toThrow(
      'Workspace storage limit reached'
    );
  });

  test('accepts an upload that exactly reaches the workspace limit (equality succeeds)', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, 100);
    await addFile(60);
    await expect(
      assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 40 })
    ).resolves.toBeUndefined();
  });

  test('a zero limit means no capacity', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, 0);
    await expect(assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 1 })).rejects.toThrow(
      'Workspace storage limit reached'
    );
  });

  test('enforces the user limit across workspaces', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, null);
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: billingUserId }, 100);
    // Usage in another workspace still counts against the same billing user.
    await addFile(60, { workspaceId: otherWorkspaceId });
    await expect(assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 50 })).rejects.toThrow(
      'User storage limit reached'
    );
  });

  test('enforces the platform limit', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, null);
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'platform' }, 100);
    // Usage from a different user/workspace counts against the platform total.
    await addFile(60, { workspaceId: otherWorkspaceId, billingUserId: 'someone-else' });
    await expect(assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 50 })).rejects.toThrow(
      'Platform storage limit reached'
    );
  });

  test('checks precedence workspace -> user -> platform', async () => {
    // All three would fail; the workspace scope is reported first.
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }, 10);
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: billingUserId }, 10);
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'platform' }, 10);
    await addFile(20);
    await expect(assertWithinStorageQuotas({ workspaceId, billingUserId, additionalBytes: 5 })).rejects.toThrow(
      'Workspace storage limit reached'
    );
  });
});
