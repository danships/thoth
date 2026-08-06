import { getSettingRepository } from '@/lib/database';
import { getLogger } from '@/lib/logger';
import type { Setting, SettingScope } from '@/types/database';
import {
  PLATFORM_SETTING_SUBJECT_ID,
  getSettingDefault,
  getSettingDefinition,
  settingSupportsScope,
  type SettingKey,
  type SettingValue,
} from './definitions';

// Where a setting lives. For `platform` scope the caller may omit `subjectId` (the fixed
// platform sentinel is used); for `user`/`workspace` scope `subjectId` is required.
export type SettingTarget = {
  scope: SettingScope;
  subjectId?: string;
};

// SuperSave has no unique-index support, so `(scope, subjectId, key)` uniqueness can't be
// enforced at the database level. This in-process lock (mirroring `workspace-slug.ts`) serialises
// writes per logical key, and canonical-row selection makes reads deterministic even if an
// earlier/cross-instance race left duplicate rows behind.
const settingWriteLocks = new Map<string, Promise<unknown>>();

function lockKey(scope: SettingScope, subjectId: string, key: string): string {
  return `${scope}::${subjectId}::${key}`;
}

async function withSettingLock<T>(lockId: string, task: () => Promise<T>): Promise<T> {
  const previous = settingWriteLocks.get(lockId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tracked = run.catch(() => undefined);
  settingWriteLocks.set(lockId, tracked);
  try {
    return await run;
  } finally {
    if (settingWriteLocks.get(lockId) === tracked) {
      settingWriteLocks.delete(lockId);
    }
  }
}

function resolveSubjectId(key: SettingKey, target: SettingTarget): string {
  if (!settingSupportsScope(key, target.scope)) {
    throw new Error(`Setting "${key}" is not supported at scope "${target.scope}"`);
  }
  if (target.scope === 'platform') {
    return target.subjectId ?? PLATFORM_SETTING_SUBJECT_ID;
  }
  if (!target.subjectId) {
    throw new Error(`Setting "${key}" at scope "${target.scope}" requires a subjectId`);
  }
  return target.subjectId;
}

// Deterministically pick the canonical row from a group of rows sharing the same logical key:
// most-recently updated wins, ties broken by lowest id. Duplicates are only expected under a
// race SuperSave can't prevent; they're logged (without values) by callers.
function selectCanonical(rows: Setting[]): Setting | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return rows.toSorted((a, b) => {
    if (a.lastUpdated !== b.lastUpdated) {
      return a.lastUpdated < b.lastUpdated ? 1 : -1;
    }
    return a.id < b.id ? -1 : 1;
  })[0];
}

function parseValue<Key extends SettingKey>(key: Key, raw: string): SettingValue<Key> {
  const definition = getSettingDefinition(key);
  const parsed = definition.schema.parse(JSON.parse(raw));
  return parsed as SettingValue<Key>;
}

/**
 * Resolves a single setting value for `key` at `target`. Returns the registered default when no
 * row exists. Groups any duplicate rows, selects the canonical one deterministically, logs the
 * duplication (without values), and validates the persisted JSON against the key's schema.
 */
export async function getSetting<Key extends SettingKey>(key: Key, target: SettingTarget): Promise<SettingValue<Key>> {
  const subjectId = resolveSubjectId(key, target);
  const repository = await getSettingRepository();
  const rows = await repository.getByQuery(
    repository.createQuery().eq('scope', target.scope).eq('subjectId', subjectId).eq('key', key)
  );

  const canonical = selectCanonical(rows);
  if (!canonical) {
    return getSettingDefault(key, target.scope);
  }

  if (rows.length > 1) {
    const logger = await getLogger();
    logger.warn('settings.duplicate-logical-key', {
      scope: target.scope,
      subjectId,
      key,
      rowCount: rows.length,
    });
  }

  return parseValue(key, canonical.value);
}

/**
 * Batch equivalent of `getSetting` for many subjects at the same scope. Avoids N+1 queries by
 * fetching every matching row in a single query, then grouping per subject. Missing subjects
 * resolve to the registered default. Returns a `Map<subjectId, value>`.
 */
export async function getSettingsForSubjects<Key extends SettingKey>(
  key: Key,
  scope: Exclude<SettingScope, 'platform'>,
  subjectIds: string[]
): Promise<Map<string, SettingValue<Key>>> {
  if (!settingSupportsScope(key, scope)) {
    throw new Error(`Setting "${key}" is not supported at scope "${scope}"`);
  }

  const result = new Map<string, SettingValue<Key>>();
  if (subjectIds.length === 0) {
    return result;
  }

  const repository = await getSettingRepository();
  const rows = await repository.getByQuery(
    repository.createQuery().eq('scope', scope).eq('key', key).in('subjectId', subjectIds)
  );

  const grouped = new Map<string, Setting[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.subjectId) ?? [];
    bucket.push(row);
    grouped.set(row.subjectId, bucket);
  }

  const defaultValue = getSettingDefault(key, scope);
  for (const subjectId of subjectIds) {
    const bucket = grouped.get(subjectId);
    const canonical = bucket ? selectCanonical(bucket) : undefined;
    result.set(subjectId, canonical ? parseValue(key, canonical.value) : defaultValue);
  }

  if (rows.length > grouped.size) {
    const logger = await getLogger();
    logger.warn('settings.duplicate-logical-key.batch', { scope, key, rowCount: rows.length, subjects: grouped.size });
  }

  return result;
}

/**
 * Persists `value` for `key` at `target`. Serialised through the per-logical-key lock: queries
 * all matching rows, updates the deterministic canonical row (creating one if none exist), and
 * deletes any duplicate rows left by an earlier/cross-instance race. Rejects unsupported scopes
 * and values that fail the key's schema.
 */
export async function setSetting<Key extends SettingKey>(
  key: Key,
  target: SettingTarget,
  value: SettingValue<Key>
): Promise<void> {
  const subjectId = resolveSubjectId(key, target);
  const definition = getSettingDefinition(key);
  const validated = definition.schema.parse(value);
  const serialized = JSON.stringify(validated);

  await withSettingLock(lockKey(target.scope, subjectId, key), async () => {
    const repository = await getSettingRepository();
    const rows = await repository.getByQuery(
      repository.createQuery().eq('scope', target.scope).eq('subjectId', subjectId).eq('key', key)
    );

    const now = new Date().toISOString();
    const canonical = selectCanonical(rows);

    if (canonical) {
      await repository.update({ ...canonical, value: serialized, lastUpdated: now });
      // Remove any duplicate rows left by earlier races so future reads have a single source.
      for (const row of rows) {
        if (row.id !== canonical.id) {
          await repository.deleteUsingId(row.id);
        }
      }
    } else {
      await repository.create({
        scope: target.scope,
        subjectId,
        key,
        value: serialized,
        createdAt: now,
        lastUpdated: now,
      });
    }
  });
}

/**
 * Removes every row with the logical key `(scope, subjectId, key)`. After deletion the setting
 * resolves back to its registered default. Serialised through the same per-key lock as writes.
 */
export async function deleteSetting(key: SettingKey, target: SettingTarget): Promise<void> {
  const subjectId = resolveSubjectId(key, target);

  await withSettingLock(lockKey(target.scope, subjectId, key), async () => {
    const repository = await getSettingRepository();
    const rows = await repository.getByQuery(
      repository.createQuery().eq('scope', target.scope).eq('subjectId', subjectId).eq('key', key)
    );
    for (const row of rows) {
      await repository.deleteUsingId(row.id);
    }
  });
}
