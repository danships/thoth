import type { Notification, NotificationRule } from '@thoth/database/types';
import type { NotificationResponse, NotificationRuleResponse } from '@/types/api';

/** Server route that marks the item read (idempotently) and redirects to the target page. */
export function notificationOpenUrl(id: string): string {
  return `/notifications/${id}/open`;
}

/** Maps an internal `Notification` row to its public per-recipient API shape (THOTH-066). */
export function toNotificationResponse(notification: Notification): NotificationResponse {
  return {
    id: notification.id,
    workspaceId: notification.workspaceId,
    containerId: notification.containerId,
    event: notification.event,
    actorType: notification.actor.type,
    actorAppId: notification.actor.type === 'app' ? notification.actor.appId : null,
    title: notification.title,
    body: notification.body,
    changeCount: notification.changeCount,
    readAt: notification.readAt,
    occurredAt: notification.occurredAt,
    createdAt: notification.createdAt,
    openUrl: notificationOpenUrl(notification.id),
  };
}

/** Maps an internal `NotificationRule` row to its public API shape (THOTH-066). */
export function toNotificationRuleResponse(rule: NotificationRule): NotificationRuleResponse {
  return {
    id: rule.id,
    workspaceId: rule.workspaceId,
    containerId: rule.containerId,
    kind: rule.kind,
    createdAt: rule.createdAt,
    lastUpdated: rule.lastUpdated,
  };
}

export type NotificationListCursor = {
  occurredAt: string;
  id: string;
};

/**
 * Encodes the compound `(occurredAt, id)` list cursor as URL-safe base64 JSON. The list is
 * ordered `occurredAt DESC, id DESC`, so a cursor marks the last item already returned and the
 * next page contains only rows strictly *before* it in that ordering.
 */
export function encodeNotificationCursor(cursor: NotificationListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decodes a `(occurredAt, id)` cursor; returns `undefined` for anything malformed. */
export function decodeNotificationCursor(raw: string): NotificationListCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record['occurredAt'] === 'string' && typeof record['id'] === 'string') {
      return { occurredAt: record['occurredAt'], id: record['id'] };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Total ordering used for the inbox list: newest `occurredAt` first, `id` DESC as a stable
 * tiebreaker. Returns negative when `a` should sort before `b`.
 */
export function compareNotificationsDesc(
  a: Pick<Notification, 'occurredAt' | 'id'>,
  b: Pick<Notification, 'occurredAt' | 'id'>
): number {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? 1 : -1;
  }
  if (a.id < b.id) {
    return 1;
  }
  return a.id > b.id ? -1 : 0;
}

/** True when `item` sorts strictly after `cursor` in the `(occurredAt DESC, id DESC)` ordering. */
export function isAfterCursor(item: Pick<Notification, 'occurredAt' | 'id'>, cursor: NotificationListCursor): boolean {
  if (item.occurredAt !== cursor.occurredAt) {
    return item.occurredAt < cursor.occurredAt;
  }
  return item.id < cursor.id;
}
