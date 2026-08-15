import {
  getNotificationDeliveryRepository,
  getNotificationRepository,
} from './repositories.js';
import type {
  Notification,
  NotificationDelivery,
  NotificationDeliveryStatus,
} from './types.js';
import type { NotificationPushDisposition } from './schemas/entities/notification.js';
import { TERMINAL_NOTIFICATION_DELIVERY_STATUSES } from './schemas/entities/notification-delivery.js';

// Per-notification lock so parallel `notification.deliver` completions don't stomp on each
// other's parent-summary recomputes.
const summaryLocks = new Map<string, Promise<unknown>>();

async function withSummaryLock<T>(notificationId: string, task: () => Promise<T>): Promise<T> {
  const previous = summaryLocks.get(notificationId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  summaryLocks.set(notificationId, tracked);
  try {
    return await run;
  } finally {
    if (summaryLocks.get(notificationId) === tracked) {
      summaryLocks.delete(notificationId);
    }
  }
}

/**
 * Create or return the existing delivery row for `(notificationId, pushSubscriptionId)`. Called
 * by the dispatch handler's push fan-out — idempotent per identity so a crash-recovered
 * re-run never duplicates a device's delivery stream.
 */
export async function createOrReuseNotificationDelivery(input: {
  notificationId: string;
  pushSubscriptionId: string;
}): Promise<NotificationDelivery> {
  const repository = await getNotificationDeliveryRepository();
  const existingRows = await repository.getByQuery(
    repository
      .createQuery()
      .eq('notificationId', input.notificationId)
      .eq('pushSubscriptionId', input.pushSubscriptionId)
  );
  if (existingRows.length > 0) {
    return existingRows[0]!;
  }
  const now = new Date().toISOString();
  return repository.create({
    notificationId: input.notificationId,
    pushSubscriptionId: input.pushSubscriptionId,
    status: 'pending',
    attempts: 0,
    httpStatus: null,
    errorCode: null,
    createdAt: now,
    lastAttemptAt: null,
    completedAt: null,
  });
}

export type CompleteNotificationDeliveryInput = {
  status: NotificationDeliveryStatus;
  httpStatus?: number | null;
  errorCode?: string | null;
};

/** Marks a delivery terminal and recomputes the parent notification's push summary. */
export async function completeNotificationDelivery(
  deliveryId: string,
  outcome: CompleteNotificationDeliveryInput
): Promise<void> {
  const repository = await getNotificationDeliveryRepository();
  const row = await repository.getById(deliveryId);
  if (!row) return;
  const now = new Date().toISOString();
  await repository.update({
    ...row,
    status: outcome.status,
    httpStatus: outcome.httpStatus ?? row.httpStatus,
    errorCode: outcome.errorCode ?? row.errorCode,
    lastAttemptAt: now,
    completedAt: now,
    attempts: row.attempts,
  });
  await recomputeParentNotificationSummary(row.notificationId);
}

/** Record a non-terminal retry attempt. */
export async function recordNotificationDeliveryAttempt(
  deliveryId: string,
  outcome: { httpStatus: number | null; errorCode: string | null }
): Promise<void> {
  const repository = await getNotificationDeliveryRepository();
  const row = await repository.getById(deliveryId);
  if (!row) return;
  await repository.update({
    ...row,
    status: 'retrying',
    httpStatus: outcome.httpStatus,
    errorCode: outcome.errorCode,
    attempts: row.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
  });
}

/** Cancel every sibling delivery for the same subscription (called on 404/410). */
export async function cancelSiblingDeliveriesForSubscription(
  pushSubscriptionId: string,
  currentDeliveryId: string
): Promise<void> {
  const repository = await getNotificationDeliveryRepository();
  const rows = await repository.getByQuery(
    repository.createQuery().eq('pushSubscriptionId', pushSubscriptionId)
  );
  const affectedParents = new Set<string>();
  const now = new Date().toISOString();
  for (const row of rows) {
    if (row.id === currentDeliveryId) continue;
    if (TERMINAL_NOTIFICATION_DELIVERY_STATUSES.includes(row.status)) continue;
    await repository.update({ ...row, status: 'cancelled', completedAt: now, lastAttemptAt: now });
    affectedParents.add(row.notificationId);
  }
  for (const parentId of affectedParents) {
    await recomputeParentNotificationSummary(parentId);
  }
}

/**
 * Recompute the parent notification's `pushDisposition`/counters based on its child deliveries.
 * Called on every terminal transition; safe to invoke concurrently (per-notification lock).
 */
export async function recomputeParentNotificationSummary(notificationId: string): Promise<void> {
  await withSummaryLock(notificationId, async () => {
    const deliveryRepository = await getNotificationDeliveryRepository();
    const notificationRepository = await getNotificationRepository();
    const notification = await notificationRepository.getById(notificationId);
    if (!notification) return;

    const rows = await deliveryRepository.getByQuery(
      deliveryRepository.createQuery().eq('notificationId', notificationId)
    );
    if (rows.length === 0) return;

    const sent = rows.filter((row) => row.status === 'sent').length;
    const failed = rows.filter((row) => row.status === 'failed').length;
    const expiredOrCancelled = rows.filter(
      (row) => row.status === 'expired' || row.status === 'cancelled'
    ).length;
    const terminalCount = sent + failed + expiredOrCancelled;
    const allTerminal = terminalCount === rows.length;

    const nonSentTerminal = failed + expiredOrCancelled;

    // Reaching here means at least one delivery row exists for this notification, so push has
    // definitely been dispatched — `disposition` always reflects the live delivery set from
    // this point on, never lingering on a prior 'queued' value once deliveries reach terminal
    // state (and vice versa: a re-dispatch that creates fresh non-terminal deliveries alongside
    // already-terminal ones goes back to 'queued' rather than keeping a stale 'sent'/'failed').
    let disposition: NotificationPushDisposition | null;
    if (allTerminal) {
      if (sent > 0 && nonSentTerminal === 0) disposition = 'sent';
      else if (sent > 0 && nonSentTerminal > 0) disposition = 'partial';
      else disposition = 'failed';
    } else {
      disposition = 'queued';
    }
    // Only bump counters if changed to avoid write churn.
    const nextPushSentCount = sent;
    const nextPushFailedCount = failed + expiredOrCancelled;
    const nextPushQueuedCount = rows.length;

    if (
      disposition === notification.pushDisposition &&
      nextPushSentCount === notification.pushSentCount &&
      nextPushFailedCount === notification.pushFailedCount &&
      nextPushQueuedCount === notification.pushQueuedCount
    ) {
      return;
    }

    const updated: Notification = {
      ...notification,
      pushDisposition: disposition,
      pushSentCount: nextPushSentCount,
      pushFailedCount: nextPushFailedCount,
      pushQueuedCount: nextPushQueuedCount,
    };
    await notificationRepository.update(updated);
  });
}

/**
 * Set the initial push summary on a newly-created inbox item (THOTH-071 dispatch extension).
 * `queuedCount` is set to the number of delivery rows created (0 for `muted`/`no_devices`).
 */
export async function setNotificationPushSummary(
  notificationId: string,
  disposition: NotificationPushDisposition,
  queuedCount: number
): Promise<void> {
  const repository = await getNotificationRepository();
  const row = await repository.getById(notificationId);
  if (!row) return;
  await repository.update({
    ...row,
    pushDisposition: disposition,
    pushQueuedCount: queuedCount,
  });
}

/** Delete every delivery row belonging to a user's subscriptions (called on user purge). */
export async function deleteNotificationDeliveriesForSubscriptionIds(
  subscriptionIds: readonly string[]
): Promise<void> {
  if (subscriptionIds.length === 0) return;
  const repository = await getNotificationDeliveryRepository();
  for (const id of subscriptionIds) {
    const rows = await repository.getByQuery(repository.createQuery().eq('pushSubscriptionId', id));
    for (const row of rows) {
      await repository.deleteUsingId(row.id);
    }
  }
}
