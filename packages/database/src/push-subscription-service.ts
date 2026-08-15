import { getPushSubscriptionRepository } from './repositories.js';
import type { PushSubscription } from './types.js';

// SuperSave has no unique indexes, so `endpoint` uniqueness is enforced in application code
// (THOTH-071). Same pattern as `apps/web/src/lib/settings/service.ts`.
const endpointWriteLocks = new Map<string, Promise<unknown>>();

async function withEndpointLock<T>(endpoint: string, task: () => Promise<T>): Promise<T> {
  const previous = endpointWriteLocks.get(endpoint) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  endpointWriteLocks.set(endpoint, tracked);
  try {
    return await run;
  } finally {
    if (endpointWriteLocks.get(endpoint) === tracked) {
      endpointWriteLocks.delete(endpoint);
    }
  }
}

function selectCanonical(rows: PushSubscription[]): PushSubscription | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

export type UpsertPushSubscriptionInput = {
  userId: string;
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  userAgentLabel: string | null;
};

/**
 * Upsert (or take over) a push-subscription row by `endpoint`. Same-browser re-registration
 * refreshes `lastSeenAt`/clears `disabledAt`. If the endpoint already exists under a *different*
 * user AND both push-encryption keys match, this atomically reassigns the row to the new user
 * (a shared browser where the previous user signed out — possession of the current endpoint +
 * keys demonstrates they own the device).
 *
 * A key mismatch under a different user is rejected (throws): the caller cannot claim someone
 * else's endpoint by guessing the URL alone.
 */
export async function upsertPushSubscriptionByEndpoint(
  input: UpsertPushSubscriptionInput
): Promise<PushSubscription> {
  return withEndpointLock(input.endpoint, async () => {
    const repository = await getPushSubscriptionRepository();
    const rows = await repository.getByQuery(repository.createQuery().eq('endpoint', input.endpoint));
    const canonical = selectCanonical(rows);
    const now = new Date().toISOString();

    if (!canonical) {
      return repository.create({
        userId: input.userId,
        endpoint: input.endpoint,
        expirationTime: input.expirationTime,
        keys: input.keys,
        userAgentLabel: input.userAgentLabel,
        disabledAt: null,
        lastSeenAt: now,
        createdAt: now,
      });
    }

    if (
      canonical.userId !== input.userId &&
      (canonical.keys.p256dh !== input.keys.p256dh || canonical.keys.auth !== input.keys.auth)
    ) {
      // Cross-account reassignment: keys must match exactly (possession-of-secret gate).
      throw new Error('push-subscription endpoint belongs to a different account');
    }

    // Remove any duplicate rows created by a prior race so future reads are deterministic. Done
    // only after the ownership/key gate above so a rejected caller can never mutate another
    // account's rows.
    for (const row of rows) {
      if (row.id !== canonical.id) {
        await repository.deleteUsingId(row.id);
      }
    }

    const updated: PushSubscription = {
      ...canonical,
      userId: input.userId,
      expirationTime: input.expirationTime,
      keys: input.keys,
      userAgentLabel: input.userAgentLabel,
      disabledAt: null,
      lastSeenAt: now,
    };
    await repository.update(updated);
    return updated;
  });
}

/**
 * Disable a subscription owned by `userId`. Idempotent (no-op if already disabled, or if the
 * row belongs to a different user — existence hiding). Returns whether a row was updated so
 * the caller can surface a "not found" hint without leaking existence to other users.
 */
export async function disablePushSubscriptionForUser(
  subscriptionId: string,
  userId: string
): Promise<boolean> {
  const repository = await getPushSubscriptionRepository();
  const row = await repository.getById(subscriptionId);
  if (!row || row.userId !== userId) {
    return false;
  }
  if (row.disabledAt !== null) {
    return true;
  }
  await repository.update({ ...row, disabledAt: new Date().toISOString() });
  return true;
}

/**
 * Called by the deliver handler when a Push provider returns 404/410 for `endpoint` — the
 * subscription is permanently gone. Sets `disabledAt` regardless of owner.
 */
export async function disablePushSubscriptionById(subscriptionId: string): Promise<void> {
  const repository = await getPushSubscriptionRepository();
  const row = await repository.getById(subscriptionId);
  if (!row || row.disabledAt !== null) return;
  await repository.update({ ...row, disabledAt: new Date().toISOString() });
}

/** Active + unexpired subscriptions for `userId`. Called by the dispatch handler's push fan-out. */
export async function listActivePushSubscriptionsForUser(userId: string): Promise<PushSubscription[]> {
  const repository = await getPushSubscriptionRepository();
  const rows = await repository.getByQuery(repository.createQuery().eq('userId', userId));
  const now = Date.now();
  return rows.filter((row) => {
    if (row.disabledAt !== null) return false;
    if (row.expirationTime !== null && row.expirationTime <= now) return false;
    return true;
  });
}

/** Delete every push-subscription row for a user (called on user purge). */
export async function deletePushSubscriptionsForUser(userId: string): Promise<void> {
  const repository = await getPushSubscriptionRepository();
  const rows = await repository.getByQuery(repository.createQuery().eq('userId', userId));
  for (const row of rows) {
    await repository.deleteUsingId(row.id);
  }
}
