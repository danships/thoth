import { afterAll, describe, expect, test } from 'vitest';
import {
  createAnonymousClient,
  createBearerClient,
  getBaseUrl,
  getData,
  getOwnerClient,
  getSecondUserClient,
  SEED,
} from '../../support/fixtures';

// THOTH-045: `SEED.user` is the earliest-registered seeded user, so it is bootstrapped as the
// single platform administrator. `SEED.secondUser` is a normal (non-admin) user.

async function makeBearerClient() {
  const owner = await getOwnerClient(getBaseUrl());
  const appResponse = await owner.post('/api/v1/apps', {
    workspaceId: SEED.workspace.id,
    label: 'E2E Admin Auth Matrix App',
    permission: 'read',
    scopeType: 'workspace',
    attributionMode: 'creator',
  });
  const app = await getData<{ id: string }>(appResponse);
  const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
  const key = await getData<{ secret: string }>(keyResponse);
  return createBearerClient(getBaseUrl(), key.secret);
}

const ADMIN_GET_ROUTES = ['/api/v1/admin/settings', '/api/v1/admin/users', '/api/v1/admin/workspaces'];

describe('platform admin route auth matrix (THOTH-045)', () => {
  // Restore platform settings to their defaults after the suite in case a test mutated them.
  afterAll(async () => {
    const owner = await getOwnerClient(getBaseUrl());
    await owner.patch('/api/v1/admin/settings', { allowUserWorkspaceCreation: true, storageQuotaBytes: null });
  });

  test('anonymous requests are rejected with 401', async () => {
    const anon = createAnonymousClient(getBaseUrl());
    for (const route of ADMIN_GET_ROUTES) {
      const response = await anon.get(route);
      expect(response.status).toBe(401);
    }
  });

  test('bearer/API-key requests are rejected with 401 (cookie sessions only)', async () => {
    const bearer = await makeBearerClient();
    for (const route of ADMIN_GET_ROUTES) {
      const response = await bearer.get(route);
      expect(response.status).toBe(401);
    }
  });

  test('non-admin cookie sessions are rejected with 403', async () => {
    const nonAdmin = await getSecondUserClient(getBaseUrl());
    for (const route of ADMIN_GET_ROUTES) {
      const response = await nonAdmin.get(route);
      expect(response.status).toBe(403);
    }
  });

  test('the platform admin is allowed (200)', async () => {
    const owner = await getOwnerClient(getBaseUrl());
    for (const route of ADMIN_GET_ROUTES) {
      const response = await owner.get(route);
      expect(response.status).toBe(200);
    }
  });

  test('GET /admin/settings returns the expected shape', async () => {
    const owner = await getOwnerClient(getBaseUrl());
    const response = await owner.get('/api/v1/admin/settings');
    const body = await getData<{
      allowUserWorkspaceCreation: boolean;
      storageQuotaBytes: number | null;
      usedBytes: number;
    }>(response);
    expect(typeof body.allowUserWorkspaceCreation).toBe('boolean');
    expect(body.usedBytes).toBeGreaterThanOrEqual(0);
  });

  test('PATCH /admin/settings rejects an empty body with 400', async () => {
    const owner = await getOwnerClient(getBaseUrl());
    const response = await owner.patch('/api/v1/admin/settings', {});
    expect(response.status).toBe(400);
  });

  test('PATCH /admin/settings rejects unknown fields with 400', async () => {
    const owner = await getOwnerClient(getBaseUrl());
    const response = await owner.patch('/api/v1/admin/settings', { unknownField: true });
    expect(response.status).toBe(400);
  });

  test('PATCH /admin/users/{id} updates a user quota and 404s for unknown users', async () => {
    const owner = await getOwnerClient(getBaseUrl());

    const ok = await owner.patch(`/api/v1/admin/users/${SEED.secondUser.id}`, { storageQuotaBytes: 1234 });
    expect(ok.status).toBe(200);
    const okBody = await getData<{ storageQuotaBytes: number | null }>(ok);
    expect(okBody.storageQuotaBytes).toBe(1234);

    // Reset back to no limit.
    await owner.patch(`/api/v1/admin/users/${SEED.secondUser.id}`, { storageQuotaBytes: null });

    const missing = await owner.patch('/api/v1/admin/users/does-not-exist', { storageQuotaBytes: 1 });
    expect(missing.status).toBe(404);
  });

  test('PATCH /admin/workspaces/{id} updates a workspace quota and 404s for unknown workspaces', async () => {
    const owner = await getOwnerClient(getBaseUrl());

    const ok = await owner.patch(`/api/v1/admin/workspaces/${SEED.workspace.id}`, { storageQuotaBytes: 4321 });
    expect(ok.status).toBe(200);
    const okBody = await getData<{ storageQuotaBytes: number | null }>(ok);
    expect(okBody.storageQuotaBytes).toBe(4321);

    // Reset back to no limit for other tests.
    await owner.patch(`/api/v1/admin/workspaces/${SEED.workspace.id}`, { storageQuotaBytes: null });

    const missing = await owner.patch('/api/v1/admin/workspaces/does-not-exist', { storageQuotaBytes: 1 });
    expect(missing.status).toBe(404);
  });
});
