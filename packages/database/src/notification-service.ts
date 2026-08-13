import {
  getNotificationRepository,
  getNotificationRuleRepository,
  getWorkspaceMemberRepository,
} from './repositories.js';
import { isAppOwnerId } from './app-service.js';
import { memberToAccessGrant, grantAllowsContainer } from './access-grant-service.js';
import type {
  Container,
  Notification,
  NotificationActor,
  NotificationCreate,
  NotificationDispatchEvent,
  NotificationRule,
  NotificationRuleKind,
} from './types.js';

/**
 * Canonicalises a set of `notification-rule` rows sharing the same logical `(userId,
 * workspaceId, containerId)` key down to the single row that should be treated as authoritative
 * (THOTH-066): the most-recently-updated one, `id` as a stable tiebreaker. Any duplicate rows
 * are a belt-and-braces artefact of SuperSave having no DB-native unique index — they're
 * ignored on read (never merged) and only ever removed by a later `upsertNotificationRule`
 * call for the same key.
 */
export function canonicalizeNotificationRules(rows: NotificationRule[]): {
  canonical: NotificationRule | undefined;
  duplicates: NotificationRule[];
} {
  if (rows.length === 0) {
    return { canonical: undefined, duplicates: [] };
  }
  const sorted = [...rows].sort((a, b) => {
    if (a.lastUpdated !== b.lastUpdated) {
      return a.lastUpdated < b.lastUpdated ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const [canonical, ...duplicates] = sorted;
  return { canonical, duplicates };
}

/** Logs (ids only, never content) that duplicate rows were found for a logical key. */
function logDuplicateRuleRows(userId: string, workspaceId: string, containerId: string | null, ids: string[]): void {
  if (ids.length === 0) {
    return;
  }
  // eslint-disable-next-line no-console -- intentional, id-only diagnostic (see THOTH-066 spec)
  console.warn('notification-rule: duplicate rows found for logical key, ignoring extras', {
    userId,
    workspaceId,
    containerId,
    duplicateIds: ids,
  });
}

/**
 * Reads and reconciles every `notification-rule` row belonging to `userId` in `workspaceId`,
 * returning exactly one (canonical) row per distinct `containerId` (including `null`, the
 * workspace-level rule). Duplicates are logged (ids only) and ignored.
 */
export async function getCanonicalRulesForUser(userId: string, workspaceId: string): Promise<NotificationRule[]> {
  const notificationRuleRepository = await getNotificationRuleRepository();
  const rows = await notificationRuleRepository.getByQuery(
    notificationRuleRepository.createQuery().eq('userId', userId).eq('workspaceId', workspaceId)
  );

  const byContainerId = new Map<string, NotificationRule[]>();
  for (const row of rows) {
    const key = row.containerId ?? '__workspace__';
    const bucket = byContainerId.get(key) ?? [];
    bucket.push(row);
    byContainerId.set(key, bucket);
  }

  const canonicalRows: NotificationRule[] = [];
  for (const [key, bucket] of byContainerId) {
    const { canonical, duplicates } = canonicalizeNotificationRules(bucket);
    if (canonical) {
      canonicalRows.push(canonical);
      logDuplicateRuleRows(
        userId,
        workspaceId,
        key === '__workspace__' ? null : key,
        duplicates.map((row) => row.id)
      );
    }
  }

  return canonicalRows;
}

/**
 * Upserts (or, for `'none'`, deletes) the canonical rule for `(userId, workspaceId,
 * containerId)`: reads every row for the key, keeps the canonical one (rewriting its `kind`),
 * and deletes any duplicates in the same operation. Selecting `'none'` deletes every row for
 * the key.
 */
export async function upsertNotificationRule(input: {
  userId: string;
  workspaceId: string;
  containerId: string | null;
  kind: NotificationRuleKind | 'none';
}): Promise<void> {
  const notificationRuleRepository = await getNotificationRuleRepository();
  // SuperSave can't reliably filter `.eq('containerId', null)` at the query level (same
  // documented limitation noted in `workspace-slug.ts` for `deletedAt`/`parentId`), so fetch
  // every row for `(userId, workspaceId)` and filter by `containerId` in application code.
  const allForUserWorkspace = await notificationRuleRepository.getByQuery(
    notificationRuleRepository.createQuery().eq('userId', input.userId).eq('workspaceId', input.workspaceId)
  );
  const rows = allForUserWorkspace.filter((row) => row.containerId === input.containerId);
  const { canonical, duplicates } = canonicalizeNotificationRules(rows);

  for (const duplicate of duplicates) {
    await notificationRuleRepository.deleteUsingId(duplicate.id);
  }

  if (input.kind === 'none') {
    if (canonical) {
      await notificationRuleRepository.deleteUsingId(canonical.id);
    }
    return;
  }

  const now = new Date().toISOString();
  if (canonical) {
    await notificationRuleRepository.update({ ...canonical, kind: input.kind, lastUpdated: now });
    return;
  }

  await notificationRuleRepository.create({
    userId: input.userId,
    workspaceId: input.workspaceId,
    containerId: input.containerId,
    kind: input.kind,
    createdAt: now,
    lastUpdated: now,
  });
}

/** Deletes every rule owned by `userId` for `containerId` (used by the page-purge cascade). */
export async function deleteNotificationRulesForContainer(containerId: string): Promise<void> {
  const notificationRuleRepository = await getNotificationRuleRepository();
  const rows = await notificationRuleRepository.getByQuery(
    notificationRuleRepository.createQuery().eq('containerId', containerId)
  );
  for (const row of rows) {
    await notificationRuleRepository.deleteUsingId(row.id);
  }
}

export type RulePrecedenceResult =
  | { decision: 'excluded' }
  | { decision: 'accepted'; sourceContainerId: string | null }
  | { decision: 'not-subscribed' };

/**
 * Resolves subscription precedence for one user against one page's *current* ancestor chain
 * (THOTH-066 spec, "Resolution precedence"): `ancestorIds` must be ordered nearest-first (the
 * page's direct parent first, root-most ancestor last) and must NOT include `pageId` itself.
 *
 * Order of evaluation (first match wins, exclusion always beats subscription):
 *   1. exact `exclude_page`/`exclude_tree` on the page itself -> excluded
 *   2. `exclude_tree` on any live ancestor -> excluded
 *   3. exact `page`/`tree` on the page itself -> accepted (source = pageId)
 *   4. `tree` on the nearest matching ancestor -> accepted (source = that ancestor id)
 *   5. a `workspace` rule (`containerId: null`) -> accepted (source = null)
 *   6. otherwise -> not-subscribed
 */
export function resolveRulePrecedence(
  pageId: string,
  ancestorIds: readonly string[],
  rulesForUser: readonly NotificationRule[]
): RulePrecedenceResult {
  const byContainerId = new Map<string | null, NotificationRuleKind>();
  for (const rule of rulesForUser) {
    byContainerId.set(rule.containerId, rule.kind);
  }

  const exactKind = byContainerId.get(pageId);
  if (exactKind === 'exclude_page' || exactKind === 'exclude_tree') {
    return { decision: 'excluded' };
  }

  for (const ancestorId of ancestorIds) {
    if (byContainerId.get(ancestorId) === 'exclude_tree') {
      return { decision: 'excluded' };
    }
  }

  if (exactKind === 'page' || exactKind === 'tree') {
    return { decision: 'accepted', sourceContainerId: pageId };
  }

  for (const ancestorId of ancestorIds) {
    if (byContainerId.get(ancestorId) === 'tree') {
      return { decision: 'accepted', sourceContainerId: ancestorId };
    }
  }

  if (byContainerId.get(null) === 'workspace') {
    return { decision: 'accepted', sourceContainerId: null };
  }

  return { decision: 'not-subscribed' };
}

/**
 * Full recipient-resolution pipeline for one `notification.dispatch` execution (THOTH-066 Job
 * Contract, steps 3-7): loads every rule + human member in the workspace, resolves precedence
 * per member over the current ancestor chain, drops synthetic App members, suppresses the
 * acting human's own change, and re-checks current membership + `AccessGrant` for every
 * surviving candidate. Returns the final `userId` list that should receive an inbox item.
 *
 * `container`/`ancestorIds` must reflect the page's *current* live state (reloaded by the
 * caller at dispatch-execution time) — this function performs no I/O against `Container`
 * itself, only against `notification-rule`/`workspace-member`.
 */
export async function resolveNotificationRecipients(input: {
  workspaceId: string;
  container: Pick<Container, 'id' | 'workspaceId'>;
  ancestorIds: readonly string[];
  actor: NotificationActor;
}): Promise<string[]> {
  const notificationRuleRepository = await getNotificationRuleRepository();
  const workspaceMemberRepository = await getWorkspaceMemberRepository();

  const allRules = await notificationRuleRepository.getByQuery(
    notificationRuleRepository.createQuery().eq('workspaceId', input.workspaceId)
  );
  const members = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', input.workspaceId)
  );

  const rulesByUserId = new Map<string, NotificationRule[]>();
  for (const rule of allRules) {
    const bucket = rulesByUserId.get(rule.userId) ?? [];
    bucket.push(rule);
    rulesByUserId.set(rule.userId, bucket);
  }

  const recipients: string[] = [];

  for (const member of members) {
    // Synthetic App members (`role: 'app'`, owner id `app--<id>`) never receive personal
    // notifications.
    if (isAppOwnerId(member.userId)) {
      continue;
    }

    // A human never gets an inbox item for their own direct edit. An App-attributed change
    // does NOT suppress the owning human — only a `type: 'user'` actor suppresses.
    if (input.actor.type === 'user' && input.actor.userId === member.userId) {
      continue;
    }

    const rulesForUser = rulesByUserId.get(member.userId) ?? [];
    // Canonicalise per-container in case duplicate rows exist for this user (belt-and-braces —
    // `upsertNotificationRule` should already prevent this in steady state).
    const canonicalByContainerId = new Map<string | null, NotificationRule>();
    for (const rule of rulesForUser) {
      const existing = canonicalByContainerId.get(rule.containerId);
      if (!existing || rule.lastUpdated > existing.lastUpdated) {
        canonicalByContainerId.set(rule.containerId, rule);
      }
    }

    const precedence = resolveRulePrecedence(input.container.id, input.ancestorIds, [
      ...canonicalByContainerId.values(),
    ]);

    if (precedence.decision !== 'accepted') {
      continue;
    }

    // Membership + grant re-check (THOTH-042/THOTH-066): a rule never confers access. The
    // member row itself was just re-read from the current DB state, so membership is already
    // current — only the AccessGrant needs an explicit check against the page.
    const grant = await memberToAccessGrant(member);
    const allowed = await grantAllowsContainer(grant, { id: input.container.id, workspaceId: input.workspaceId });
    if (!allowed) {
      continue;
    }

    recipients.push(member.userId);
  }

  return recipients;
}

/**
 * Finds the inbox item already created for a given `notification.dispatch` job + recipient
 * pair, if any (THOTH-066 idempotency — mirrors `findDeliveryBySourceJobAndWebhook`). A
 * duplicate SuperSave row (belt-and-braces) is reconciled by `createdAt ASC, id ASC`; extras
 * are logged (ids only) and ignored.
 */
export async function findNotificationBySourceJobAndRecipient(
  sourceJobId: string,
  userId: string
): Promise<Notification | undefined> {
  const notificationRepository = await getNotificationRepository();
  const rows = await notificationRepository.getByQuery(
    notificationRepository.createQuery().eq('sourceJobId', sourceJobId).eq('userId', userId)
  );

  if (rows.length === 0) {
    return undefined;
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const [canonical, ...duplicates] = sorted;
  if (duplicates.length > 0) {
    // eslint-disable-next-line no-console -- intentional, id-only diagnostic (see THOTH-066 spec)
    console.warn('notification: duplicate rows found for (sourceJobId, userId), ignoring extras', {
      sourceJobId,
      userId,
      duplicateIds: duplicates.map((row) => row.id),
    });
  }
  return canonical;
}

export type CreateNotificationInput = {
  userId: string;
  workspaceId: string;
  containerId: string;
  event: NotificationDispatchEvent;
  actor: NotificationActor;
  title: string;
  body: string;
  changeCount: number;
  sourceJobId: string;
  occurredAt: string;
};

/** Creates a new, immutable inbox item. Idempotency is the caller's responsibility (see `findNotificationBySourceJobAndRecipient`). */
export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const notificationRepository = await getNotificationRepository();
  const create: NotificationCreate = {
    userId: input.userId,
    workspaceId: input.workspaceId,
    containerId: input.containerId,
    event: input.event,
    actor: input.actor,
    title: input.title,
    body: input.body,
    changeCount: input.changeCount,
    sourceJobId: input.sourceJobId,
    occurredAt: input.occurredAt,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  return notificationRepository.create(create);
}

/** Builds the actor's display label used in rendered notification title/body (THOTH-066). Falls back to a neutral label if the app's own label isn't known to the caller. */
export function renderActorLabel(
  actor: NotificationActor,
  options: { userDisplayName?: string | null; appLabel?: string | null }
): string {
  if (actor.type === 'app') {
    return options.appLabel && options.appLabel.length > 0 ? options.appLabel : 'An App';
  }
  return options.userDisplayName && options.userDisplayName.length > 0 ? options.userDisplayName : 'Someone';
}

/**
 * Renders the frozen `title`/`body` strings for a new inbox item (THOTH-066). Contains only
 * page/workspace/actor *names* and a change count — never field values or page content.
 */
export function renderNotificationTitleBody(input: {
  pageName: string;
  workspaceName: string;
  actorLabel: string;
  event: NotificationDispatchEvent;
  changeCount: number;
}): { title: string; body: string } {
  const action = input.event === 'page.created' ? 'created' : 'updated';
  const title = `${input.actorLabel} ${action} "${input.pageName}"`;
  const changeSummary =
    input.changeCount === 1 ? '1 change' : `${input.changeCount} changes`;
  const body = `${changeSummary} in ${input.workspaceName}`;
  return { title, body };
}

/** Deletes every rule + inbox item owned by `userId` (used by the account-purge path). */
export async function deleteNotificationDataForUser(userId: string): Promise<void> {
  const notificationRuleRepository = await getNotificationRuleRepository();
  const notificationRepository = await getNotificationRepository();

  const rules = await notificationRuleRepository.getByQuery(notificationRuleRepository.createQuery().eq('userId', userId));
  for (const rule of rules) {
    await notificationRuleRepository.deleteUsingId(rule.id);
  }

  const items = await notificationRepository.getByQuery(notificationRepository.createQuery().eq('userId', userId));
  for (const item of items) {
    await notificationRepository.deleteUsingId(item.id);
  }
}
