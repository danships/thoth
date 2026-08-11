import type { SuperSave } from 'supersave';
import type { Database } from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';
import * as entities from '../entities';
import type { PlatformUser, PlatformUserCreate } from '../types';

type AuthUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string | Date | null;
};

// Reads the Better Auth `user` table directly via the shared SuperSave connection (there is no
// SuperSave entity for it). Engine-agnostic: better-sqlite3 exposes `.prepare`, mysql2's pool
// exposes `.query`. Mirrors the raw-SQL approach used by the `better-auth` migration.
async function readAuthUsers(superSave: SuperSave): Promise<AuthUserRow[]> {
  const connection = superSave.getConnection<Database | Pool>();
  if (typeof (connection as Database).prepare === 'function') {
    const sqlite = connection as Database;
    return sqlite.prepare('SELECT id, name, email, createdAt FROM user').all() as AuthUserRow[];
  }
  const pool = connection as Pool;
  const [rows] = await pool.query('SELECT id, name, email, createdAt FROM `user`');
  return rows as AuthUserRow[];
}

function toIso(value: string | Date | null, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

/**
 * One-time backfill for THOTH-045: creates a `platform-user` projection for every existing Better
 * Auth user (role `user`, `registeredAt` copied from `user.createdAt`), then deterministically
 * selects the earliest (`registeredAt ASC, userId ASC`) and gives only that user `platform_admin`.
 * Idempotent — existing projections are left untouched except for the single-admin invariant.
 *
 * Uses `superSave.getRepository` directly (never `getPlatformUserRepository`) because this runs
 * *inside* `runMigrations()`, before the cached `getDatabase()` promise has resolved — awaiting
 * that promise here would deadlock.
 */
export async function backfillPlatformUsers(superSave: SuperSave): Promise<void> {
  const repository = superSave.getRepository<PlatformUserCreate & { id: string }>(entities.PLATFORM_USER_NAME);
  const authUsers = await readAuthUsers(superSave);
  const now = new Date().toISOString();

  for (const authUser of authUsers) {
    const existing = await repository.getOneByQuery(repository.createQuery().eq('userId', authUser.id));
    if (existing) {
      continue;
    }
    await repository.create({
      userId: authUser.id,
      name: authUser.name ?? '',
      email: authUser.email ?? '',
      role: 'user',
      registeredAt: toIso(authUser.createdAt, now),
      createdAt: now,
      lastUpdated: now,
    });
  }

  const rows: PlatformUser[] = await repository.getByQuery(repository.createQuery());
  let earliest: PlatformUser | undefined;
  for (const row of rows) {
    if (earliest === undefined) {
      earliest = row;
      continue;
    }
    if (row.registeredAt !== earliest.registeredAt) {
      earliest = row.registeredAt < earliest.registeredAt ? row : earliest;
    } else if (row.userId < earliest.userId) {
      earliest = row;
    }
  }

  if (!earliest) {
    return;
  }

  for (const row of rows) {
    const desiredRole = row.id === earliest.id ? 'platform_admin' : 'user';
    if (row.role !== desiredRole) {
      await repository.update({ ...row, role: desiredRole, lastUpdated: new Date().toISOString() });
    }
  }
}
