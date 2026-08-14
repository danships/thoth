import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from './context.js';
import { getWorkspaceMemberRepository, getNotificationRuleRepository, getNotificationRepository } from './repositories.js';
import { toAppOwnerId } from './app-service.js';
import {
  canonicalizeNotificationRules,
  resolveRulePrecedence,
  resolveNotificationRecipients,
  upsertNotificationRule,
  getCanonicalRulesForUser,
  findNotificationBySourceJobAndRecipient,
  createNotification,
} from './notification-service.js';
import type { NotificationRule, WorkspaceMember } from './types.js';

describe('notification-service', () => {
  let temporaryDirectory = '';
  let workspaceMemberRepository: Awaited<ReturnType<typeof getWorkspaceMemberRepository>>;
  let notificationRuleRepository: Awaited<ReturnType<typeof getNotificationRuleRepository>>;
  let notificationRepository: Awaited<ReturnType<typeof getNotificationRepository>>;

  const workspaceId = 'workspace-1';

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-notification-service-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));

    workspaceMemberRepository = await getWorkspaceMemberRepository();
    notificationRuleRepository = await getNotificationRuleRepository();
    notificationRepository = await getNotificationRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    for (const row of await workspaceMemberRepository.getByQuery(workspaceMemberRepository.createQuery())) {
      await workspaceMemberRepository.deleteUsingId(row.id);
    }
    for (const row of await notificationRuleRepository.getByQuery(notificationRuleRepository.createQuery())) {
      await notificationRuleRepository.deleteUsingId(row.id);
    }
    for (const row of await notificationRepository.getByQuery(notificationRepository.createQuery())) {
      await notificationRepository.deleteUsingId(row.id);
    }
  });

  async function createMember(userId: string, options: Partial<WorkspaceMember> = {}): Promise<WorkspaceMember> {
    const now = new Date().toISOString();
    return workspaceMemberRepository.create({
      workspaceId,
      userId,
      role: 'editor',
      permission: 'read_write',
      scopeType: 'workspace',
      createdAt: now,
      ...options,
    } as Parameters<typeof workspaceMemberRepository.create>[0]);
  }

  describe('canonicalizeNotificationRules', () => {
    test('keeps the most-recently-updated row, id as tiebreaker', () => {
      const rows = [
        { id: 'b', lastUpdated: '2024-01-01T00:00:00.000Z' } as NotificationRule,
        { id: 'a', lastUpdated: '2024-01-02T00:00:00.000Z' } as NotificationRule,
        { id: 'c', lastUpdated: '2024-01-02T00:00:00.000Z' } as NotificationRule,
      ];
      const { canonical, duplicates } = canonicalizeNotificationRules(rows);
      expect(canonical?.id).toBe('a');
      expect(duplicates.map((row) => row.id).toSorted()).toEqual(['b', 'c']);
    });

    test('returns undefined canonical for an empty list', () => {
      expect(canonicalizeNotificationRules([])).toEqual({ canonical: undefined, duplicates: [] });
    });
  });

  describe('resolveRulePrecedence', () => {
    const pageId = 'page-1';

    test('an exact exclude_page rule rejects the page', () => {
      const result = resolveRulePrecedence(pageId, ['ancestor-1'], [
        { containerId: pageId, kind: 'exclude_page' } as NotificationRule,
        { containerId: 'ancestor-1', kind: 'tree' } as NotificationRule,
      ]);
      expect(result).toEqual({ decision: 'excluded' });
    });

    test('an exclude_tree on an ancestor rejects the whole subtree, even over an exact subscription', () => {
      const result = resolveRulePrecedence(pageId, ['ancestor-1'], [
        { containerId: pageId, kind: 'page' } as NotificationRule,
        { containerId: 'ancestor-1', kind: 'exclude_tree' } as NotificationRule,
      ]);
      expect(result).toEqual({ decision: 'excluded' });
    });

    test('an exact page rule accepts, source is the page itself', () => {
      const result = resolveRulePrecedence(pageId, [], [{ containerId: pageId, kind: 'page' } as NotificationRule]);
      expect(result).toEqual({ decision: 'accepted', sourceContainerId: pageId });
    });

    test('a tree rule on an ancestor accepts, source is the nearest matching ancestor', () => {
      const result = resolveRulePrecedence(pageId, ['near', 'far'], [
        { containerId: 'near', kind: 'tree' } as NotificationRule,
        { containerId: 'far', kind: 'tree' } as NotificationRule,
      ]);
      expect(result).toEqual({ decision: 'accepted', sourceContainerId: 'near' });
    });

    test('a workspace rule accepts when nothing more specific matches', () => {
      const result = resolveRulePrecedence(pageId, ['ancestor-1'], [
        { containerId: null, kind: 'workspace' } as NotificationRule,
      ]);
      expect(result).toEqual({ decision: 'accepted', sourceContainerId: null });
    });

    test('no matching rule at all is not-subscribed', () => {
      const result = resolveRulePrecedence(pageId, ['ancestor-1'], []);
      expect(result).toEqual({ decision: 'not-subscribed' });
    });

    test('exclude_page on the exact page does not reject a lower subscription on a descendant', () => {
      // exclude_page only rejects the exact page itself — verified by resolving a *different*
      // (descendant) page id against the same rule set, which should fall through untouched.
      const descendantId = 'descendant-1';
      const result = resolveRulePrecedence(descendantId, [pageId], [
        { containerId: pageId, kind: 'exclude_page' } as NotificationRule,
        { containerId: descendantId, kind: 'page' } as NotificationRule,
      ]);
      expect(result).toEqual({ decision: 'accepted', sourceContainerId: descendantId });
    });
  });

  describe('resolveNotificationRecipients', () => {
    test('drops synthetic App members', async () => {
      const appOwnerId = toAppOwnerId('app-1');
      await createMember(appOwnerId, { role: 'app' });
      await upsertNotificationRule({ userId: appOwnerId, workspaceId, containerId: null, kind: 'workspace' });

      const recipients = await resolveNotificationRecipients({
        workspaceId,
        container: { id: 'page-1', workspaceId },
        ancestorIds: [],
        actor: { type: 'user', userId: 'someone-else' },
      });

      expect(recipients).toEqual([]);
    });

    test('suppresses the acting human for their own change', async () => {
      await createMember('user-a');
      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: null, kind: 'workspace' });

      const recipients = await resolveNotificationRecipients({
        workspaceId,
        container: { id: 'page-1', workspaceId },
        ancestorIds: [],
        actor: { type: 'user', userId: 'user-a' },
      });

      expect(recipients).toEqual([]);
    });

    test('does NOT suppress the owning human for an App-attributed change', async () => {
      await createMember('user-a');
      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: null, kind: 'workspace' });

      const recipients = await resolveNotificationRecipients({
        workspaceId,
        container: { id: 'page-1', workspaceId },
        ancestorIds: [],
        actor: { type: 'app', appId: 'app-1', userId: 'user-a' },
      });

      expect(recipients).toEqual(['user-a']);
    });

    test('drops a recipient whose grant no longer covers the page', async () => {
      await createMember('user-a', { scopeType: 'containers' });
      // A `containers`-scoped member with no scoped containers registered covers nothing.
      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: 'page-1', kind: 'page' });

      const recipients = await resolveNotificationRecipients({
        workspaceId,
        container: { id: 'page-1', workspaceId },
        ancestorIds: [],
        actor: { type: 'user', userId: 'someone-else' },
      });

      expect(recipients).toEqual([]);
    });

    test('includes a subscribed, non-acting, in-scope member', async () => {
      await createMember('user-a');
      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: 'page-1', kind: 'page' });

      const recipients = await resolveNotificationRecipients({
        workspaceId,
        container: { id: 'page-1', workspaceId },
        ancestorIds: [],
        actor: { type: 'user', userId: 'someone-else' },
      });

      expect(recipients).toEqual(['user-a']);
    });
  });

  describe('upsertNotificationRule / getCanonicalRulesForUser', () => {
    test('creates, updates, and deletes (kind: none) the canonical row for a key', async () => {
      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: 'page-1', kind: 'page' });
      let rules = await getCanonicalRulesForUser('user-a', workspaceId);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.kind).toBe('page');

      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: 'page-1', kind: 'tree' });
      rules = await getCanonicalRulesForUser('user-a', workspaceId);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.kind).toBe('tree');

      await upsertNotificationRule({ userId: 'user-a', workspaceId, containerId: 'page-1', kind: 'none' });
      rules = await getCanonicalRulesForUser('user-a', workspaceId);
      expect(rules).toHaveLength(0);
    });

    test('reconciles duplicate rows for the same key down to one canonical row', async () => {
      const now = new Date().toISOString();
      await notificationRuleRepository.create({
        userId: 'user-a',
        workspaceId,
        containerId: 'page-1',
        kind: 'page',
        createdAt: now,
        lastUpdated: now,
      } as Parameters<typeof notificationRuleRepository.create>[0]);
      await notificationRuleRepository.create({
        userId: 'user-a',
        workspaceId,
        containerId: 'page-1',
        kind: 'tree',
        createdAt: now,
        lastUpdated: new Date(Date.now() + 1000).toISOString(),
      } as Parameters<typeof notificationRuleRepository.create>[0]);

      const rules = await getCanonicalRulesForUser('user-a', workspaceId);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.kind).toBe('tree');
    });
  });

  describe('findNotificationBySourceJobAndRecipient (idempotency)', () => {
    test('a repeated create attempt is guarded by the (sourceJobId, userId) lookup', async () => {
      const existing = await findNotificationBySourceJobAndRecipient('job-1', 'user-a');
      expect(existing).toBeUndefined();

      const created = await createNotification({
        userId: 'user-a',
        workspaceId,
        containerId: 'page-1',
        event: 'page.updated',
        actor: { type: 'user', userId: 'user-b' },
        title: 'Someone updated "Page"',
        body: '1 change in Workspace',
        changeCount: 1,
        sourceJobId: 'job-1',
        occurredAt: new Date().toISOString(),
      });

      const found = await findNotificationBySourceJobAndRecipient('job-1', 'user-a');
      expect(found?.id).toBe(created.id);
    });
  });
});
