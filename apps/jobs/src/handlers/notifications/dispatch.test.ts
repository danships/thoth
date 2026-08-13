import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import {
  createDatabaseContext,
  resetDatabaseContext,
  setDatabaseContext,
  getContainerRepository,
  getWorkspaceRepository,
  getWorkspaceMemberRepository,
  getNotificationRepository,
  getNotificationRuleRepository,
  upsertNotificationRule,
  type PageContainer,
  type WorkspaceMember,
} from '@thoth/database';
import type { JobExecutionContext, NotificationDispatchPayloadV1 } from '@thoth/job-protocol';
import {
  notificationDispatchJobDefinition,
  notificationDispatchDedupeKey,
  mergeNotificationDispatchPayload,
} from './dispatch.js';

function makeContext(
  payload: NotificationDispatchPayloadV1,
  jobId = 'job-1'
): JobExecutionContext<NotificationDispatchPayloadV1> {
  return {
    jobId,
    type: 'notification.dispatch',
    payloadVersion: 1,
    payload,
    attempt: 1,
    maxAttempts: 1,
    signal: new AbortController().signal,
    now: () => new Date(),
    enqueueChild: async () => {
      throw new Error('THOTH-066: notification.dispatch must never enqueue a child job');
    },
  };
}

describe('mergeNotificationDispatchPayload', () => {
  test('sums changeCount, keeps the latest occurredAt, and page.created wins', () => {
    const existing: NotificationDispatchPayloadV1 = {
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.created',
      actor: { type: 'user', userId: 'user-1' },
      changeCount: 2,
      occurredAt: '2024-01-01T00:00:00.000Z',
    };
    const incoming: NotificationDispatchPayloadV1 = {
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'user-1' },
      changeCount: 3,
      occurredAt: '2024-01-01T00:05:00.000Z',
    };

    const merged = mergeNotificationDispatchPayload(existing, incoming);
    expect(merged.event).toBe('page.created');
    expect(merged.changeCount).toBe(5);
    expect(merged.occurredAt).toBe('2024-01-01T00:05:00.000Z');
  });
});

describe('notificationDispatchDedupeKey', () => {
  test('keys per-actor — two different actors on the same page produce different keys', () => {
    const base = {
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.updated' as const,
      changeCount: 1,
      occurredAt: new Date().toISOString(),
    };
    const keyForUserA = notificationDispatchDedupeKey({ ...base, actor: { type: 'user', userId: 'user-a' } });
    const keyForUserB = notificationDispatchDedupeKey({ ...base, actor: { type: 'user', userId: 'user-b' } });
    expect(keyForUserA).not.toBe(keyForUserB);
    expect(keyForUserA).toBe('notification:workspace-1:page-1:user:user-a');
  });
});

describe('notificationDispatchJobDefinition handler', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let workspaceRepository: Awaited<ReturnType<typeof getWorkspaceRepository>>;
  let workspaceMemberRepository: Awaited<ReturnType<typeof getWorkspaceMemberRepository>>;
  let notificationRepository: Awaited<ReturnType<typeof getNotificationRepository>>;
  let notificationRuleRepository: Awaited<ReturnType<typeof getNotificationRuleRepository>>;

  const workspaceId = 'workspace-1';

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-notification-dispatch-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));

    containerRepository = await getContainerRepository();
    workspaceRepository = await getWorkspaceRepository();
    workspaceMemberRepository = await getWorkspaceMemberRepository();
    notificationRepository = await getNotificationRepository();
    notificationRuleRepository = await getNotificationRuleRepository();

    await workspaceRepository.create({
      id: workspaceId,
      name: 'Test Workspace',
      slug: 'test-workspace',
      userId: 'owner-1',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      deletedAt: null,
      storageQuotaBytes: 52_428_800,
    } as Parameters<typeof workspaceRepository.create>[0]);
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    for (const row of await containerRepository.getByQuery(containerRepository.createQuery())) {
      await containerRepository.deleteUsingId(row.id);
    }
    for (const row of await workspaceMemberRepository.getByQuery(workspaceMemberRepository.createQuery())) {
      await workspaceMemberRepository.deleteUsingId(row.id);
    }
    for (const row of await notificationRepository.getByQuery(notificationRepository.createQuery())) {
      await notificationRepository.deleteUsingId(row.id);
    }
    for (const row of await notificationRuleRepository.getByQuery(notificationRuleRepository.createQuery())) {
      await notificationRuleRepository.deleteUsingId(row.id);
    }
  });

  async function createPage(overrides: Partial<PageContainer> = {}): Promise<PageContainer> {
    const now = new Date().toISOString();
    return containerRepository.create({
      id: overrides.id ?? 'page-1',
      name: overrides.name ?? 'Test Page',
      type: 'page',
      parentId: overrides.parentId ?? null,
      workspaceId,
      userId: 'author-1',
      emoji: null,
      values: {},
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      sortOrder: null,
      ...overrides,
    } as Parameters<typeof containerRepository.create>[0]) as unknown as Promise<PageContainer>;
  }

  async function createMember(userId: string, overrides: Partial<WorkspaceMember> = {}): Promise<WorkspaceMember> {
    return workspaceMemberRepository.create({
      workspaceId,
      userId,
      role: 'editor',
      permission: 'read_write',
      scopeType: 'workspace',
      createdAt: new Date().toISOString(),
      ...overrides,
    } as Parameters<typeof workspaceMemberRepository.create>[0]);
  }

  test('is a no-op when the container is missing', async () => {
    const payload: NotificationDispatchPayloadV1 = {
      workspaceId,
      containerId: 'missing-page',
      event: 'page.updated',
      actor: { type: 'user', userId: 'user-a' },
      changeCount: 1,
      occurredAt: new Date().toISOString(),
    };
    const result = await notificationDispatchJobDefinition.handler(makeContext(payload));
    expect(result).toEqual({ skipped: 'container-missing-or-not-a-page' });
  });

  test('creates exactly one inbox item per subscribed, non-acting recipient', async () => {
    await createPage();
    await createMember('recipient-a');
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: null, kind: 'workspace' });

    const payload: NotificationDispatchPayloadV1 = {
      workspaceId,
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'author-1' },
      changeCount: 2,
      occurredAt: new Date().toISOString(),
    };

    const result = await notificationDispatchJobDefinition.handler(makeContext(payload));
    expect(result).toEqual({ recipients: 1, created: 1 });

    const rows = await notificationRepository.getByQuery(notificationRepository.createQuery().eq('userId', 'recipient-a'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.containerId).toBe('page-1');
    expect(rows[0]?.changeCount).toBe(2);
  });

  test('never creates an item for the acting human (own-change suppression)', async () => {
    await createPage();
    await createMember('author-1');
    await upsertNotificationRule({ userId: 'author-1', workspaceId, containerId: null, kind: 'workspace' });

    const payload: NotificationDispatchPayloadV1 = {
      workspaceId,
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'author-1' },
      changeCount: 1,
      occurredAt: new Date().toISOString(),
    };

    const result = await notificationDispatchJobDefinition.handler(makeContext(payload));
    expect(result).toEqual({ recipients: 0 });
  });

  test('crash-recovery: a repeated dispatch for the same jobId never duplicates an inbox item', async () => {
    await createPage();
    await createMember('recipient-a');
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: null, kind: 'workspace' });

    const payload: NotificationDispatchPayloadV1 = {
      workspaceId,
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'author-1' },
      changeCount: 1,
      occurredAt: new Date().toISOString(),
    };

    await notificationDispatchJobDefinition.handler(makeContext(payload, 'job-crash-1'));
    await notificationDispatchJobDefinition.handler(makeContext(payload, 'job-crash-1'));

    const rows = await notificationRepository.getByQuery(
      notificationRepository.createQuery().eq('sourceJobId', 'job-crash-1').eq('userId', 'recipient-a')
    );
    expect(rows).toHaveLength(1);
  });

  test('never enqueues a child job (no delivery rows/push in THOTH-066)', async () => {
    await createPage();
    await createMember('recipient-a');
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: null, kind: 'workspace' });

    const payload: NotificationDispatchPayloadV1 = {
      workspaceId,
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'user', userId: 'author-1' },
      changeCount: 1,
      occurredAt: new Date().toISOString(),
    };

    // makeContext's enqueueChild throws if ever called — a passing test with no thrown error is
    // the assertion that the handler never calls it.
    await expect(notificationDispatchJobDefinition.handler(makeContext(payload))).resolves.toBeDefined();
  });
});
