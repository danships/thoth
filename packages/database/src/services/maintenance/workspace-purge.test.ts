import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from '../../context.js';
import {
  getAppRepository,
  getApiKeyRepository,
  getAppScopedContainerRepository,
  getContainerAccessRepository,
  getContainerRepository,
  getDataViewRepository,
  getFileUsageRepository,
  getMemberScopedContainerRepository,
  getPageRevisionRepository,
  getUploadedFileRepository,
  getWebhookDeliveryRepository,
  getWebhookRepository,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
  getWorkspaceSlugRedirectRepository,
} from '../../repositories.js';
import { selectPurgeableWorkspaces, revalidateWorkspaceForPurge, purgeWorkspace } from './workspace-purge.js';
import type { Workspace } from '../../types.js';

describe('workspace-purge', () => {
  let temporaryDirectory = '';
  let workspaceRepository: Awaited<ReturnType<typeof getWorkspaceRepository>>;
  let counter = 0;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-workspace-purge-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));
    workspaceRepository = await getWorkspaceRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createWorkspace(options: {
    deletedAt?: string | null;
    lastUpdated?: string;
  }): Promise<Workspace> {
    counter += 1;
    const now = new Date().toISOString();
    return workspaceRepository.create({
      name: `Workspace ${counter}`,
      slug: `workspace-${counter}`,
      userId: 'user-1',
      deletedAt: options.deletedAt ?? null,
      storageQuotaBytes: 1000,
      createdAt: now,
      lastUpdated: options.lastUpdated ?? now,
    } as Parameters<typeof workspaceRepository.create>[0]);
  }

  const OLD_ISO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const RECENT_ISO = new Date(Date.now() - 1000).toISOString();
  const graceThresholdMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

  describe('selectPurgeableWorkspaces', () => {
    test('selects only soft-deleted workspaces past grace and outside the race margin', async () => {
      const eligible = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await createWorkspace({ deletedAt: null }); // never deleted
      await createWorkspace({ deletedAt: RECENT_ISO, lastUpdated: RECENT_ISO }); // too recent
      await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: RECENT_ISO }); // touched inside race margin

      const batch = await selectPurgeableWorkspaces({ graceThresholdMs, nowMs: Date.now(), limit: 50, offset: 0 });
      expect(batch.candidates.map((workspace) => workspace.id)).toEqual([eligible.id]);
      expect(batch.totalEligible).toBe(1);
    });

    test('offset skips already-processed candidates within one bounded execution', async () => {
      const first = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      const second = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });

      const fullScan = await selectPurgeableWorkspaces({ graceThresholdMs, nowMs: Date.now(), limit: 1000, offset: 0 });
      const indexOfFirst = fullScan.candidates.findIndex((workspace) => workspace.id === first.id);
      expect(indexOfFirst).toBeGreaterThanOrEqual(0);

      const batch = await selectPurgeableWorkspaces({
        graceThresholdMs,
        nowMs: Date.now(),
        limit: 1000,
        offset: indexOfFirst + 1,
      });
      expect(batch.candidates.map((workspace) => workspace.id)).not.toContain(first.id);
      expect(batch.totalEligible).toBe(fullScan.totalEligible);
      expect(batch.candidates.map((workspace) => workspace.id)).toContain(second.id);
    });
  });

  describe('revalidateWorkspaceForPurge', () => {
    test('returns undefined for a workspace restored since the scan', async () => {
      const workspace = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await workspaceRepository.update({ ...workspace, deletedAt: null });

      const revalidated = await revalidateWorkspaceForPurge(workspace.id, graceThresholdMs);
      expect(revalidated).toBeUndefined();
    });

    test('returns undefined for a missing workspace', async () => {
      const revalidated = await revalidateWorkspaceForPurge('does-not-exist', graceThresholdMs);
      expect(revalidated).toBeUndefined();
    });

    test('returns the workspace when still eligible', async () => {
      const workspace = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      const revalidated = await revalidateWorkspaceForPurge(workspace.id, graceThresholdMs);
      expect(revalidated?.id).toBe(workspace.id);
    });
  });

  describe('purgeWorkspace cascade', () => {
    test('cascade-deletes every registered dependent entity, then the workspace, and is idempotent on rerun', async () => {
      const workspace = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });

      const containerRepository = await getContainerRepository();
      const dataViewRepository = await getDataViewRepository();
      const workspaceMemberRepository = await getWorkspaceMemberRepository();
      const workspaceSlugRedirectRepository = await getWorkspaceSlugRedirectRepository();
      const containerAccessRepository = await getContainerAccessRepository();
      const appRepository = await getAppRepository();
      const apiKeyRepository = await getApiKeyRepository();
      const webhookRepository = await getWebhookRepository();
      const webhookDeliveryRepository = await getWebhookDeliveryRepository();
      const appScopedContainerRepository = await getAppScopedContainerRepository();
      const memberScopedContainerRepository = await getMemberScopedContainerRepository();
      const fileUsageRepository = await getFileUsageRepository();
      const uploadedFileRepository = await getUploadedFileRepository();
      const pageRevisionRepository = await getPageRevisionRepository();

      const now = new Date().toISOString();

      const page = await containerRepository.create({
        name: 'Page',
        type: 'page',
        parentId: null,
        workspaceId: workspace.id,
        userId: 'other-user', // deliberately a different creator than the workspace/root
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
      } as Parameters<typeof containerRepository.create>[0]);

      const dataView = await dataViewRepository.create({
        name: 'View',
        dataSourceId: 'ds-1',
        workspaceId: workspace.id,
        userId: 'other-user',
        columns: [],
        filters: [],
        sorts: [],
        columnLayout: null,
        deletedAt: null,
        deletedRootId: null,
        createdAt: now,
        lastUpdated: now,
      } as Parameters<typeof dataViewRepository.create>[0]);

      const member = await workspaceMemberRepository.create({
        workspaceId: workspace.id,
        userId: 'member-user',
        role: 'editor',
        permission: 'read_write',
        scopeType: 'workspace',
        createdAt: now,
      } as Parameters<typeof workspaceMemberRepository.create>[0]);

      await workspaceSlugRedirectRepository.create({
        slug: 'old-slug',
        workspaceId: workspace.id,
        createdAt: now,
      } as Parameters<typeof workspaceSlugRedirectRepository.create>[0]);

      await containerAccessRepository.create({
        containerId: page.id,
        parentId: null,
        workspaceId: workspace.id,
        userId: 'member-user',
        lastAccessedAt: now,
        starred: false,
        starredAt: null,
        createdAt: now,
      } as Parameters<typeof containerAccessRepository.create>[0]);

      const app = await appRepository.create({
        label: 'Test App',
        workspaceId: workspace.id,
        createdByUserId: 'user-1',
        attributionMode: 'creator',
        permission: 'read_write',
        scopeType: 'workspace',
        archivedAt: null,
        createdAt: now,
        lastUpdated: now,
      } as Parameters<typeof appRepository.create>[0]);

      await apiKeyRepository.create({
        appId: app.id,
        label: 'Key',
        keyPrefix: 'abcd',
        keyHash: 'hash',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now,
      } as Parameters<typeof apiKeyRepository.create>[0]);

      const webhook = await webhookRepository.create({
        appId: app.id,
        workspaceId: workspace.id,
        label: 'Hook',
        url: 'https://example.com/hook',
        secret: 'secret',
        enabled: true,
        suppressOwnChanges: false,
        createdAt: now,
        lastUpdated: now,
      } as Parameters<typeof webhookRepository.create>[0]);

      await webhookDeliveryRepository.create({
        webhookId: webhook.id,
        appId: app.id,
        event: 'page.created',
        containerId: page.id,
        payload: {
          event: 'page.created',
          deliveryId: 'placeholder',
          timestamp: now,
          workspaceId: workspace.id,
          appId: app.id,
          page: { id: page.id, name: 'Page', parentId: null, type: 'page', lastUpdated: now },
        },
        status: 'success',
        httpStatus: 200,
        error: null,
        attempts: 1,
        sourceJobId: null,
        createdAt: now,
        lastAttemptAt: now,
        nextAttemptAt: null,
        completedAt: now,
      } as Parameters<typeof webhookDeliveryRepository.create>[0]);

      await appScopedContainerRepository.create({
        appId: app.id,
        containerId: page.id,
        createdAt: now,
      } as Parameters<typeof appScopedContainerRepository.create>[0]);

      await memberScopedContainerRepository.create({
        workspaceMemberId: member.id,
        containerId: page.id,
        createdAt: now,
      } as Parameters<typeof memberScopedContainerRepository.create>[0]);

      const uploadedFile = await uploadedFileRepository.create({
        filename: 'file.png',
        mimeType: 'image/png',
        size: 10,
        extension: 'png',
        storageKey: 'key-1',
        storageType: 'local',
        billingUserId: 'user-1',
        workspaceId: workspace.id,
        userId: 'user-1',
        createdAt: now,
        lastUpdated: now,
      } as Parameters<typeof uploadedFileRepository.create>[0]);

      await fileUsageRepository.create({
        fileId: uploadedFile.id,
        containerId: page.id,
        workspaceId: workspace.id,
        userId: 'user-1',
        createdAt: now,
      } as Parameters<typeof fileUsageRepository.create>[0]);

      await pageRevisionRepository.create({
        containerId: page.id,
        sequence: 1,
        previousSequence: null,
        kind: 'snapshot',
        target: 'content',
        content: 'hello',
        patch: '',
        valuesBefore: '',
        author: 'user-1',
        charsAdded: 5,
        charsRemoved: 0,
        coalesceWindowEnd: now,
        consolidated: false,
        workspaceId: workspace.id,
        userId: 'user-1',
        createdAt: now,
        lastUpdated: now,
      } as Parameters<typeof pageRevisionRepository.create>[0]);

      const outcome = await purgeWorkspace(workspace.id, graceThresholdMs);
      expect(outcome.status).toBe('purged');
      if (outcome.status !== 'purged') {
        throw new Error('expected purged');
      }
      expect(outcome.counts.containers).toBe(1);
      expect(outcome.counts.dataViews).toBe(1);
      expect(outcome.counts.workspaceMembers).toBe(1);
      expect(outcome.counts.workspaceSlugRedirects).toBe(1);
      expect(outcome.counts.containerAccess).toBe(1);
      expect(outcome.counts.apps).toBe(1);
      expect(outcome.counts.apiKeys).toBe(1);
      expect(outcome.counts.webhooks).toBe(1);
      expect(outcome.counts.webhookDeliveries).toBe(1);
      expect(outcome.counts.appScopedContainers).toBe(1);
      expect(outcome.counts.memberScopedContainers).toBe(1);
      expect(outcome.counts.uploadedFiles).toBe(1);
      expect(outcome.counts.fileUsages).toBe(1);
      expect(outcome.counts.pageRevisions).toBe(1);

      // Everything (including the page created by a *different* userId than the workspace
      // owner) is gone — content deletion is scoped by workspace, never creator (THOTH-042).
      expect(await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', page.id))).toBeFalsy();
      expect(await dataViewRepository.getOneByQuery(dataViewRepository.createQuery().eq('id', dataView.id))).toBeFalsy();
      expect(await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspace.id))).toBeFalsy();

      // Idempotent rerun: workspace is already gone, revalidation returns undefined, no error.
      const secondOutcome = await purgeWorkspace(workspace.id, graceThresholdMs);
      expect(secondOutcome.status).toBe('skipped');
    });

    test('skips a workspace restored since the scan, deleting nothing', async () => {
      const workspace = await createWorkspace({ deletedAt: OLD_ISO, lastUpdated: OLD_ISO });
      await workspaceRepository.update({ ...workspace, deletedAt: null });

      const outcome = await purgeWorkspace(workspace.id, graceThresholdMs);
      expect(outcome.status).toBe('skipped');

      const stillThere = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspace.id));
      expect(stillThere).toBeTruthy();
    });
  });
});
