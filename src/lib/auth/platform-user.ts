import { getPlatformUserRepository } from '@/lib/database';
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import type { ApiKeySession } from '@/lib/auth/session';
import type { PlatformUser } from '@/types/database';

// Minimal shape of a Better Auth user needed to project a `platform-user` row.
export type AuthUserProjectionInput = {
  id: string;
  name?: string | null | undefined;
  email?: string | null | undefined;
  createdAt?: Date | string | null | undefined;
};

// Single module-level lock (mirroring `workspace-slug.ts`) serialising all mutations to the
// `platform-user` projection set, so first-user-admin bootstrap and reconciliation can never
// race each other into two admins.
let platformUserLock: Promise<unknown> = Promise.resolve();

async function withPlatformUserLock<T>(task: () => Promise<T>): Promise<T> {
  const run = platformUserLock.catch(() => undefined).then(task);
  platformUserLock = run.catch(() => undefined);
  return run;
}

function toIsoString(value: Date | string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

// Deterministic "earliest registered" ordering: oldest `registeredAt` wins, ties broken by
// lowest `userId`. This is the single rule for who the initial platform admin is.
function isEarlier(a: PlatformUser, b: PlatformUser): boolean {
  if (a.registeredAt !== b.registeredAt) {
    return a.registeredAt < b.registeredAt;
  }
  return a.userId < b.userId;
}

function selectEarliest(rows: PlatformUser[]): PlatformUser | undefined {
  let earliest: PlatformUser | undefined;
  for (const row of rows) {
    if (earliest === undefined || isEarlier(row, earliest)) {
      earliest = row;
    }
  }
  return earliest;
}

/**
 * Loads the `platform-user` projection for `userId`, or `undefined` if none exists.
 */
export async function getPlatformUser(userId: string): Promise<PlatformUser | undefined> {
  const repository = await getPlatformUserRepository();
  return (await repository.getOneByQuery(repository.createQuery().eq('userId', userId))) ?? undefined;
}

/**
 * Cheap boolean check used by policy helpers (e.g. workspace-creation). Never throws.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const platformUser = await getPlatformUser(userId);
  return platformUser?.role === 'platform_admin';
}

/**
 * Called from the Better Auth user-create hook (BEFORE `createWorkspaceForUser`). Creates the
 * projection for the new user (role defaults to `user`), then — while holding the lock — ensures
 * the deterministically-earliest projection overall (and only it) has role `platform_admin`,
 * demoting any others. This bootstraps the very first user on an empty install as admin without
 * any environment allow-list.
 */
export async function registerPlatformUser(authUser: AuthUserProjectionInput): Promise<void> {
  await withPlatformUserLock(async () => {
    const repository = await getPlatformUserRepository();
    const now = new Date().toISOString();

    const existing = await repository.getOneByQuery(repository.createQuery().eq('userId', authUser.id));
    if (!existing) {
      await repository.create({
        userId: authUser.id,
        name: authUser.name ?? '',
        email: authUser.email ?? '',
        role: 'user',
        registeredAt: toIsoString(authUser.createdAt, now),
        createdAt: now,
        lastUpdated: now,
      });
    }

    await ensureSingleAdmin(repository);
  });
}

/**
 * Dedupes projections by `userId` (keeps the lowest `id` as canonical, merges newest name/email
 * metadata into it, deletes duplicates), then re-selects the deterministically-earliest
 * projection overall and ensures it alone is `platform_admin`. Safe to call anytime; idempotent.
 */
export async function reconcileInitialPlatformAdministrator(): Promise<void> {
  await withPlatformUserLock(async () => {
    const repository = await getPlatformUserRepository();
    const rows = await repository.getByQuery(repository.createQuery());

    // Group by userId and collapse duplicates.
    const byUserId = new Map<string, PlatformUser[]>();
    for (const row of rows) {
      const bucket = byUserId.get(row.userId) ?? [];
      bucket.push(row);
      byUserId.set(row.userId, bucket);
    }

    for (const bucket of byUserId.values()) {
      if (bucket.length <= 1) {
        continue;
      }
      const sortedById = bucket.toSorted((a, b) => (a.id < b.id ? -1 : 1));
      const canonical = sortedById[0];
      const newest = bucket.toSorted((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1))[0];
      if (!canonical || !newest) {
        continue;
      }
      await repository.update({
        ...canonical,
        name: newest.name,
        email: newest.email,
        lastUpdated: new Date().toISOString(),
      });
      for (const row of bucket) {
        if (row.id !== canonical.id) {
          await repository.deleteUsingId(row.id);
        }
      }
    }

    await ensureSingleAdmin(repository);
  });
}

// Assumes the caller holds the platform-user lock. Ensures exactly the earliest projection is
// `platform_admin` and everyone else is `user`.
async function ensureSingleAdmin(repository: Awaited<ReturnType<typeof getPlatformUserRepository>>): Promise<void> {
  const rows = await repository.getByQuery(repository.createQuery());
  const earliest = selectEarliest(rows);
  if (!earliest) {
    return;
  }

  for (const row of rows) {
    const shouldBeAdmin = row.id === earliest.id;
    const desiredRole = shouldBeAdmin ? 'platform_admin' : 'user';
    if (row.role !== desiredRole) {
      await repository.update({ ...row, role: desiredRole, lastUpdated: new Date().toISOString() });
    }
  }
}

/**
 * Best-effort refresh of a projection's `name`/`email` from the current Better Auth user (never
 * touches `role`). Creates the projection if missing. Callable on cookie-session resolution;
 * safe to fire-and-forget.
 */
export async function syncPlatformUserMetadata(authUser: AuthUserProjectionInput): Promise<void> {
  const repository = await getPlatformUserRepository();
  const existing = await repository.getOneByQuery(repository.createQuery().eq('userId', authUser.id));
  const now = new Date().toISOString();

  if (!existing) {
    await registerPlatformUser(authUser);
    return;
  }

  const nextName = authUser.name ?? existing.name;
  const nextEmail = authUser.email ?? existing.email;
  if (nextName === existing.name && nextEmail === existing.email) {
    return;
  }

  await repository.update({ ...existing, name: nextName, email: nextEmail, lastUpdated: now });
}

/**
 * The single chokepoint for platform-admin API routes (THOTH-045). Reconciles the admin set,
 * then requires a genuine human cookie session whose projection has role `platform_admin`.
 *
 * - App/bearer (`session.appContext`) callers -> `NotAuthorizedError` (401): admin routes need a
 *   real human, never an API key (belt-and-suspenders alongside the route's `disallowApiKey`).
 * - Missing session -> handled upstream by `apiRoute`, but guarded here too (401).
 * - Non-admin human -> `ForbiddenError` (403).
 */
export async function assertPlatformAdmin(session: ApiKeySession): Promise<PlatformUser> {
  if (!session?.user?.id) {
    throw new NotAuthorizedError('Session not found');
  }
  if (session.appContext) {
    throw new NotAuthorizedError('API keys cannot be used to call this endpoint');
  }

  await reconcileInitialPlatformAdministrator();

  const repository = await getPlatformUserRepository();
  let platformUser = await repository.getOneByQuery(repository.createQuery().eq('userId', session.user.id));

  if (!platformUser) {
    // A cookie session whose projection somehow doesn't exist yet (e.g. created before this
    // feature shipped): create it lazily as a non-admin, then re-run reconciliation in case this
    // is actually the earliest user on the platform.
    await registerPlatformUser({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      createdAt: session.user.createdAt,
    });
    platformUser = await repository.getOneByQuery(repository.createQuery().eq('userId', session.user.id));
  }

  if (!platformUser || platformUser.role !== 'platform_admin') {
    throw new ForbiddenError('Platform administrator access is required');
  }

  return platformUser;
}
