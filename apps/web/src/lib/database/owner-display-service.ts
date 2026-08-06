import type { Database } from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';
import { getDatabase } from './index';
import { getAppRepository } from './index';
import { getEnvironment } from '../environment';
import { isAppOwnerId, parseAppOwnerId } from './app-service';

export type OwnerDisplay = { kind: 'user' | 'app'; name: string };

/**
 * Resolves a `userId` (as stored on `Container`/other user-owned rows) into a display label,
 * branching on the `"app--"` owner-id prefix convention (see `app-service.ts`): for a real
 * `better-auth` user id, looks up `user.name`; for an App-attributed id, strips the prefix and
 * looks up `App.label`. Never throws — an App that was somehow hard-deleted (shouldn't happen,
 * per the archive-not-delete policy) falls back to a generic label rather than surfacing an
 * error to whatever surface is rendering "created/updated by X".
 */
export async function resolveOwnerDisplay(userId: string): Promise<OwnerDisplay> {
  const appId = parseAppOwnerId(userId);

  if (isAppOwnerId(userId) && appId) {
    const appRepository = await getAppRepository();
    const app = await appRepository.getOneByQuery(appRepository.createQuery().eq('id', appId));

    return { kind: 'app', name: app?.label ?? 'Unknown app' };
  }

  const name = await lookupBetterAuthUsername(userId);
  return { kind: 'user', name: name ?? 'Unknown user' };
}

async function lookupBetterAuthUsername(userId: string): Promise<string | null> {
  const environment = await getEnvironment();
  const database = await getDatabase();

  if (environment.DB.startsWith('sqlite://')) {
    const connection = database.getConnection<Database>();
    const row = connection.prepare('SELECT name FROM user WHERE id = ?').get(userId) as { name: string } | undefined;
    return row?.name ?? null;
  }

  const pool = database.getConnection<Pool>();
  const [rows] = await pool.query('SELECT name FROM user WHERE id = ? LIMIT 1', [userId]);
  const results = rows as Array<{ name: string }>;
  return results[0]?.name ?? null;
}
