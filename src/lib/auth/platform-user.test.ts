import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { setupTestDatabase } from '@/lib/test-utils/database';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error';

describe('platform-user service', () => {
  let cleanup: () => Promise<void>;
  let database: typeof import('@/lib/database');
  let platformUser: typeof import('./platform-user');

  beforeAll(async () => {
    const setup = await setupTestDatabase('platform-user');
    cleanup = setup.cleanup;
    database = setup.database;
    platformUser = await import('./platform-user');
  });

  afterEach(async () => {
    const repository = await database.getPlatformUserRepository();
    const rows = await repository.getByQuery(repository.createQuery());
    for (const row of rows) {
      await repository.deleteUsingId(row.id);
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  test('the first registered user becomes platform_admin, later users do not', async () => {
    await platformUser.registerPlatformUser({
      id: 'user-a',
      name: 'A',
      email: 'a@test.local',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    await platformUser.registerPlatformUser({
      id: 'user-b',
      name: 'B',
      email: 'b@test.local',
      createdAt: '2024-02-01T00:00:00.000Z',
    });

    expect(await platformUser.isPlatformAdmin('user-a')).toBe(true);
    expect(await platformUser.isPlatformAdmin('user-b')).toBe(false);
  });

  test('registration order does not matter — earliest registeredAt wins', async () => {
    // Register the later user first; the earlier-registered one should still become admin.
    await platformUser.registerPlatformUser({
      id: 'later',
      name: 'Later',
      email: 'later@test.local',
      createdAt: '2024-03-01T00:00:00.000Z',
    });
    await platformUser.registerPlatformUser({
      id: 'earlier',
      name: 'Earlier',
      email: 'earlier@test.local',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    expect(await platformUser.isPlatformAdmin('earlier')).toBe(true);
    expect(await platformUser.isPlatformAdmin('later')).toBe(false);
  });

  test('reconcileInitialPlatformAdministrator dedupes projections by userId', async () => {
    const repository = await database.getPlatformUserRepository();
    // Two projections for the same userId (a race).
    await repository.create({
      userId: 'dup-user',
      name: 'Old name',
      email: 'old@test.local',
      role: 'user',
      registeredAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
    });
    await repository.create({
      userId: 'dup-user',
      name: 'New name',
      email: 'new@test.local',
      role: 'user',
      registeredAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-02T00:00:00.000Z',
      lastUpdated: '2024-01-02T00:00:00.000Z',
    });

    await platformUser.reconcileInitialPlatformAdministrator();

    const rows = await repository.getByQuery(repository.createQuery().eq('userId', 'dup-user'));
    expect(rows).toHaveLength(1);
    // Newest metadata merged into the canonical row.
    expect(rows[0]?.name).toBe('New name');
    // Only projection overall -> becomes admin.
    expect(rows[0]?.role).toBe('platform_admin');
  });

  test('assertPlatformAdmin allows an admin cookie session', async () => {
    await platformUser.registerPlatformUser({
      id: 'admin-user',
      name: 'Admin',
      email: 'admin@test.local',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    const result = await platformUser.assertPlatformAdmin({
      user: { id: 'admin-user', name: 'Admin', email: 'admin@test.local' },
    } as Parameters<typeof platformUser.assertPlatformAdmin>[0]);
    expect(result.role).toBe('platform_admin');
  });

  test('assertPlatformAdmin forbids a non-admin cookie session', async () => {
    await platformUser.registerPlatformUser({
      id: 'admin-user',
      name: 'Admin',
      email: 'admin@test.local',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    await platformUser.registerPlatformUser({
      id: 'plain-user',
      name: 'Plain',
      email: 'plain@test.local',
      createdAt: '2024-02-01T00:00:00.000Z',
    });

    await expect(
      platformUser.assertPlatformAdmin({
        user: { id: 'plain-user', name: 'Plain', email: 'plain@test.local' },
      } as Parameters<typeof platformUser.assertPlatformAdmin>[0])
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test('assertPlatformAdmin rejects App/bearer sessions with NotAuthorizedError', async () => {
    await expect(
      platformUser.assertPlatformAdmin({
        user: { id: 'app--some-app', name: 'App', email: '' },
        appContext: { appId: 'some-app' },
      } as Parameters<typeof platformUser.assertPlatformAdmin>[0])
    ).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});
