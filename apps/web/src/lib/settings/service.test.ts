import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { setupTestDatabase } from '@/lib/test-utils/database';
import { deleteSetting, getSetting, getSettingsForSubjects, setSetting } from './service';
import { STORAGE_QUOTA_BYTES_KEY, WORKSPACE_CREATION_SELF_SERVICE_KEY } from './definitions';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';

describe('settings service', () => {
  let cleanup: () => Promise<void>;
  let getSettingRepository: (typeof import('@/lib/database'))['getSettingRepository'];

  beforeAll(async () => {
    const setup = await setupTestDatabase('settings-service');
    cleanup = setup.cleanup;
    getSettingRepository = setup.database.getSettingRepository;
  });

  afterAll(async () => {
    await cleanup();
  });

  test('returns the registered default when no row exists', async () => {
    expect(await getSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'platform' })).toBe(true);
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'platform' })).toBeNull();
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-none' })).toBeNull();
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: 'ws-none' })).toBe(
      DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES
    );
  });

  test('persists and reads back a value', async () => {
    await setSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'platform' }, false);
    expect(await getSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'platform' })).toBe(false);

    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-1' }, 2048);
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-1' })).toBe(2048);

    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-1' }, null);
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-1' })).toBeNull();
  });

  test('setSetting updates the existing canonical row rather than creating duplicates', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: 'ws-canonical' }, 100);
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: 'ws-canonical' }, 200);

    const repository = await getSettingRepository();
    const rows = await repository.getByQuery(
      repository
        .createQuery()
        .eq('scope', 'workspace')
        .eq('subjectId', 'ws-canonical')
        .eq('key', STORAGE_QUOTA_BYTES_KEY)
    );
    expect(rows).toHaveLength(1);
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: 'ws-canonical' })).toBe(200);
  });

  test('canonical selection wins and duplicates are cleaned up on next write', async () => {
    const repository = await getSettingRepository();
    // Simulate a cross-instance race: two rows for the same logical key.
    await repository.create({
      scope: 'user',
      subjectId: 'user-dup',
      key: STORAGE_QUOTA_BYTES_KEY,
      value: JSON.stringify(10),
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
    });
    await repository.create({
      scope: 'user',
      subjectId: 'user-dup',
      key: STORAGE_QUOTA_BYTES_KEY,
      value: JSON.stringify(20),
      createdAt: '2024-01-02T00:00:00.000Z',
      lastUpdated: '2024-01-02T00:00:00.000Z',
    });

    // Canonical = most recently updated (value 20).
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-dup' })).toBe(20);

    // A write collapses the duplicates to a single canonical row.
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-dup' }, 30);
    const rows = await repository.getByQuery(
      repository.createQuery().eq('scope', 'user').eq('subjectId', 'user-dup').eq('key', STORAGE_QUOTA_BYTES_KEY)
    );
    expect(rows).toHaveLength(1);
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-dup' })).toBe(30);
  });

  test('deleteSetting removes all rows and resolves back to default', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-del' }, 500);
    await deleteSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-del' });
    expect(await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-del' })).toBeNull();
  });

  test('getSettingsForSubjects batches and fills defaults for missing subjects', async () => {
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'batch-a' }, 111);
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'batch-b' }, 222);

    const result = await getSettingsForSubjects(STORAGE_QUOTA_BYTES_KEY, 'user', [
      'batch-a',
      'batch-b',
      'batch-missing',
    ]);
    expect(result.get('batch-a')).toBe(111);
    expect(result.get('batch-b')).toBe(222);
    expect(result.get('batch-missing')).toBeNull();
  });

  test('rejects writes at unsupported scopes', async () => {
    await expect(
      setSetting(WORKSPACE_CREATION_SELF_SERVICE_KEY, { scope: 'user', subjectId: 'user-x' }, true)
    ).rejects.toThrow(/not supported at scope/);
  });

  test('validates persisted values against the schema', async () => {
    await expect(setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: 'user-y' }, -5)).rejects.toThrow();
  });

  test('requires a subjectId for non-platform scopes', async () => {
    await expect(getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user' })).rejects.toThrow(/requires a subjectId/);
  });
});
