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
  getDataViewRepository,
  upsertNotificationRule,
  type PageContainer,
  type DataSourceContainer,
  type WorkspaceMember,
} from '@thoth/database';
import { notificationDispatchPayloadV1Schema, type JobExecutionContext, type NotificationDispatchPayloadV1 } from '@thoth/job-protocol';
import { QueueService } from '../../queue/queue-service.js';
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

  test('clamps accumulated changeCount to the protocol maximum', () => {
    const existing: NotificationDispatchPayloadV1 = {
      workspaceId: 'workspace-1', containerId: 'page-1', event: 'page.updated',
      actor: { type: 'user', userId: 'user-1' }, changeCount: 80_000, occurredAt: '2024-01-01T00:00:00.000Z',
    };
    const incoming: NotificationDispatchPayloadV1 = {
      ...existing, changeCount: 30_000, occurredAt: '2024-01-01T00:01:00.000Z',
    };

    const merged = mergeNotificationDispatchPayload(existing, incoming);
    expect(merged.changeCount).toBe(100_000);
    expect(notificationDispatchPayloadV1Schema.safeParse(merged).success).toBe(true);
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

describe('notification.dispatch queue grouping', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');

  function payload(overrides: Partial<NotificationDispatchPayloadV1> = {}): NotificationDispatchPayloadV1 {
    return {
      workspaceId: 'workspace-1',
      containerId: 'page-1',
      event: 'page.updated',
      actor: { type: 'app', appId: 'app-1', userId: 'author-1' },
      changeCount: 1,
      occurredAt: start.toISOString(),
      ...overrides,
    };
  }

  async function enqueue(queue: QueueService, jobPayload: NotificationDispatchPayloadV1, now: Date) {
    return queue.enqueue({
      type: notificationDispatchJobDefinition.type,
      payloadVersion: notificationDispatchJobDefinition.payloadVersion,
      payload: jobPayload,
      priority: notificationDispatchJobDefinition.priority,
      maxAttempts: notificationDispatchJobDefinition.maxAttempts,
      dedupeKey: notificationDispatchJobDefinition.dedupeKey(jobPayload),
      coalesce: notificationDispatchJobDefinition.coalesce,
    }, now);
  }

  test('trailing-debounces matching app page updates and dispatches the aggregate once due', async () => {
    const queue = new QueueService();
    const firstPayload = payload({ changeCount: 2 });
    const first = await enqueue(queue, firstPayload, start);
    expect(first.record.runAt).toEqual(new Date(start.getTime() + 180_000));

    const secondAt = new Date(start.getTime() + 60_000);
    const secondPayload = payload({ changeCount: 3, occurredAt: secondAt.toISOString() });
    const second = await enqueue(queue, secondPayload, secondAt);

    expect(second.disposition).toBe('coalesced');
    expect(second.record.id).toBe(first.record.id);
    expect(queue.all()).toHaveLength(1);
    expect(second.record.payload).toMatchObject({ changeCount: 5, occurredAt: secondAt.toISOString() });
    expect(second.record.runAt).toEqual(new Date(start.getTime() + 240_000));
    await expect(queue.claimNextDue(new Date(start.getTime() + 239_999))).resolves.toBeUndefined();
    await expect(queue.claimNextDue(new Date(start.getTime() + 240_000))).resolves.toMatchObject({ id: first.record.id });
  });

  test('caps a continuous matching burst five minutes after its first event', async () => {
    const queue = new QueueService();
    await enqueue(queue, payload(), start);
    await enqueue(queue, payload({ occurredAt: new Date(start.getTime() + 120_000).toISOString() }), new Date(start.getTime() + 120_000));
    const last = await enqueue(queue, payload({ occurredAt: new Date(start.getTime() + 240_000).toISOString() }), new Date(start.getTime() + 240_000));

    expect(last.record.runAt).toEqual(new Date(start.getTime() + 300_000));
  });

  test('keeps different pages and app actors in separate queue records', async () => {
    const queue = new QueueService();
    const pageOne = payload();
    const pageTwo = payload({ containerId: 'page-2' });
    const otherApp = payload({ actor: { type: 'app', appId: 'app-2', userId: 'author-1' } });

    expect(notificationDispatchDedupeKey(pageOne)).not.toBe(notificationDispatchDedupeKey(pageTwo));
    expect(notificationDispatchDedupeKey(pageOne)).not.toBe(notificationDispatchDedupeKey(otherApp));
    await enqueue(queue, pageOne, start);
    await enqueue(queue, pageTwo, start);
    await enqueue(queue, otherApp, start);
    expect(queue.all()).toHaveLength(3);
  });
});

describe('notificationDispatchJobDefinition handler', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let workspaceRepository: Awaited<ReturnType<typeof getWorkspaceRepository>>;
  let workspaceMemberRepository: Awaited<ReturnType<typeof getWorkspaceMemberRepository>>;
  let notificationRepository: Awaited<ReturnType<typeof getNotificationRepository>>;
  let notificationRuleRepository: Awaited<ReturnType<typeof getNotificationRuleRepository>>;
  let dataViewRepository: Awaited<ReturnType<typeof getDataViewRepository>>;

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
    dataViewRepository = await getDataViewRepository();

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
    for (const row of await dataViewRepository.getByQuery(dataViewRepository.createQuery())) {
      await dataViewRepository.deleteUsingId(row.id);
    }
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

  async function createDataSource(id = 'data-source'): Promise<DataSourceContainer> {
    const now = new Date().toISOString();
    return containerRepository.create({
      id, name: 'Data source', type: 'data-source', parentId: null, workspaceId, userId: 'author-1', emoji: null,
      columns: [], lastUpdated: now, createdAt: now, deletedAt: null, deletedRootId: null, sortOrder: null,
      isPrivate: false, privateRootId: null,
    } as Parameters<typeof containerRepository.create>[0]) as unknown as Promise<DataSourceContainer>;
  }

  async function embedDataSource(host: PageContainer, dataSourceId: string): Promise<void> {
    const now = new Date().toISOString();
    const dataView = await dataViewRepository.create({
      workspaceId, dataSourceId, name: 'Embedded view', userId: 'author-1', columns: [], filters: [], sorts: [], columnLayout: null,
      lastUpdated: now, createdAt: now, deletedAt: null, deletedRootId: null, isPrivate: false, privateRootId: null,
    } as Parameters<typeof dataViewRepository.create>[0]);
    await containerRepository.update({ ...host, views: [...(host.views ?? []), dataView.id] });
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

  test('creates one inbox item with the queued aggregate payload', async () => {
    await createPage();
    await createMember('recipient-a');
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: null, kind: 'workspace' });
    const queue = new QueueService();
    const firstAt = new Date('2026-01-01T00:00:00.000Z');
    const firstPayload: NotificationDispatchPayloadV1 = {
      workspaceId, containerId: 'page-1', event: 'page.updated',
      actor: { type: 'app', appId: 'app-1', userId: 'author-1' }, changeCount: 2, occurredAt: firstAt.toISOString(),
    };
    const first = await queue.enqueue({
      type: notificationDispatchJobDefinition.type, payloadVersion: notificationDispatchJobDefinition.payloadVersion,
      payload: firstPayload, priority: notificationDispatchJobDefinition.priority,
      maxAttempts: notificationDispatchJobDefinition.maxAttempts,
      dedupeKey: notificationDispatchJobDefinition.dedupeKey(firstPayload), coalesce: notificationDispatchJobDefinition.coalesce,
    }, firstAt);
    const secondAt = new Date(firstAt.getTime() + 60_000);
    await queue.enqueue({
      type: notificationDispatchJobDefinition.type, payloadVersion: notificationDispatchJobDefinition.payloadVersion,
      payload: { ...firstPayload, changeCount: 3, occurredAt: secondAt.toISOString() },
      priority: notificationDispatchJobDefinition.priority, maxAttempts: notificationDispatchJobDefinition.maxAttempts,
      dedupeKey: notificationDispatchJobDefinition.dedupeKey(firstPayload), coalesce: notificationDispatchJobDefinition.coalesce,
    }, secondAt);

    const queued = queue.get(first.record.id)!;
    const result = await notificationDispatchJobDefinition.handler(makeContext(
      queued.payload as NotificationDispatchPayloadV1, queued.id
    ));
    expect(result).toEqual({ recipients: 1, created: 1 });
    const rows = await notificationRepository.getByQuery(notificationRepository.createQuery().eq('sourceJobId', queued.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.changeCount).toBe(5);
  });

  test('notifies a tree subscriber when an embedded data-source row changes', async () => {
    const host = await createPage({ id: 'host-page' });
    const dataSource = await createDataSource();
    await embedDataSource(host, dataSource.id);
    await createPage({ id: 'row-page', parentId: dataSource.id });
    await createMember('recipient-a');
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: host.id, kind: 'tree' });

    const result = await notificationDispatchJobDefinition.handler(makeContext({
      workspaceId, containerId: 'row-page', event: 'page.updated', actor: { type: 'app', appId: 'app-1', userId: 'author-1' },
      changeCount: 1, occurredAt: new Date().toISOString(),
    }));

    expect(result).toEqual({ recipients: 1, created: 1 });
    await expect(notificationRepository.getByQuery(notificationRepository.createQuery().eq('containerId', 'row-page'))).resolves.toHaveLength(1);
  });

  test('an exclude_tree rule on the embedded host suppresses the row notification', async () => {
    const host = await createPage({ id: 'host-page' });
    const dataSource = await createDataSource();
    await embedDataSource(host, dataSource.id);
    await createPage({ id: 'row-page', parentId: dataSource.id });
    await createMember('recipient-a');
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: host.id, kind: 'exclude_tree' });
    await upsertNotificationRule({ userId: 'recipient-a', workspaceId, containerId: null, kind: 'workspace' });

    await expect(notificationDispatchJobDefinition.handler(makeContext({
      workspaceId, containerId: 'row-page', event: 'page.updated', actor: { type: 'user', userId: 'author-1' },
      changeCount: 1, occurredAt: new Date().toISOString(),
    }))).resolves.toEqual({ recipients: 0 });
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
