import type { APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

type AppApi = {
  id: string;
  workspaceId: string;
  label: string;
  permission: 'read' | 'read_write';
  scopeType: 'workspace' | 'containers' | 'containers_with_children';
  attributionMode: 'creator' | 'app';
  archivedAt: string | null;
  keyCount: number;
};

type ApiKeyApi = {
  id: string;
  label: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type CreateKeyResponse = ApiKeyApi & { secret: string };

// Covers the THOTH-026 "Apps" management API: CRUD on `App`s, key minting/rotation/revocation,
// and the cascade-archive behaviour. All requests here use the shared seed user's session
// cookie (via the `request` fixture) — bearer-token authentication itself (the fallback path
// used by an App's own keys) is covered separately in `bearer-auth.spec.ts`.
test.describe('apps management API', () => {
  test('can create, list, update and archive an App scoped to the whole workspace', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Whole Workspace App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = await getData<AppApi>(createResponse);
    expect(created.label).toBe('E2E Whole Workspace App');
    expect(created.scopeType).toBe('workspace');
    expect(created.keyCount).toBe(0);

    const listResponse = await request.get('/api/v1/apps', { params: { workspaceId: SEED.workspace.id } });
    expect(listResponse.ok()).toBeTruthy();
    const { apps } = await getData<{ apps: AppApi[] }>(listResponse);
    expect(apps.some((app) => app.id === created.id)).toBeTruthy();

    const patchResponse = await request.patch(`/api/v1/apps/${created.id}`, {
      data: { label: 'E2E Renamed App', permission: 'read_write' },
    });
    expect(patchResponse.ok()).toBeTruthy();
    const updated = await getData<AppApi>(patchResponse);
    expect(updated.label).toBe('E2E Renamed App');
    expect(updated.permission).toBe('read_write');

    const archiveResponse = await request.delete(`/api/v1/apps/${created.id}`);
    expect(archiveResponse.status()).toBe(204);

    const detailResponse = await request.get(`/api/v1/apps/${created.id}`);
    const detail = await getData<AppApi>(detailResponse);
    expect(detail.archivedAt).not.toBeNull();
  });

  test('requires containerIds when scopeType is not "workspace"', async ({ request }) => {
    const response = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Missing Scope App',
        permission: 'read',
        scopeType: 'containers',
        attributionMode: 'creator',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('can scope an App to specific containers', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Scoped App',
        permission: 'read',
        scopeType: 'containers',
        attributionMode: 'creator',
        containerIds: [SEED.pages.root.id],
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = await getData<AppApi & { containers?: { id: string }[] }>(createResponse);
    expect(created.containers?.map((container) => container.id)).toContain(SEED.pages.root.id);
  });

  test('mints a one-time key secret, then supports rotation (mint + revoke old)', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Key Rotation App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);

    const firstKeyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, {
      data: { label: 'prod' },
    });
    expect(firstKeyResponse.ok()).toBeTruthy();
    const firstKey = await getData<CreateKeyResponse>(firstKeyResponse);
    expect(firstKey.secret).toMatch(/^thk_/);
    expect(firstKey.keyPrefix).toBe(firstKey.secret.slice(0, 12));

    const secondKeyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, {
      data: { label: 'prod-2' },
    });
    const secondKey = await getData<CreateKeyResponse>(secondKeyResponse);
    expect(secondKey.secret).not.toBe(firstKey.secret);

    const revokeResponse = await request.delete(`/api/v1/apps/${app.id}/keys/${firstKey.id}`);
    expect(revokeResponse.status()).toBe(204);

    const detailResponse = await request.get(`/api/v1/apps/${app.id}`);
    const detail = await getData<{ keys: ApiKeyApi[] }>(detailResponse);
    const revokedKey = detail.keys.find((key) => key.id === firstKey.id);
    const activeKey = detail.keys.find((key) => key.id === secondKey.id);
    expect(revokedKey?.revokedAt).not.toBeNull();
    expect(activeKey?.revokedAt).toBeNull();
  });

  test('rejects minting a key with a non-future expiresAt', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Expiry Validation App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);

    const response = await request.post(`/api/v1/apps/${app.id}/keys`, {
      data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(response.status()).toBe(400);
  });

  test('archiving an App cascades to revoke all of its keys', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Cascade Archive App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);

    const keyOneResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const keyOne = await getData<CreateKeyResponse>(keyOneResponse);
    const keyTwoResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const keyTwo = await getData<CreateKeyResponse>(keyTwoResponse);

    const archiveResponse = await request.delete(`/api/v1/apps/${app.id}`);
    expect(archiveResponse.status()).toBe(204);

    const detailResponse = await request.get(`/api/v1/apps/${app.id}`);
    const detail = await getData<{ keys: ApiKeyApi[] }>(detailResponse);
    expect(detail.keys.find((key) => key.id === keyOne.id)?.revokedAt).not.toBeNull();
    expect(detail.keys.find((key) => key.id === keyTwo.id)?.revokedAt).not.toBeNull();

    // Minting a new key under an archived App is rejected.
    const mintAfterArchiveResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    expect(mintAfterArchiveResponse.status()).toBe(409);
  });

  test('cannot manage an App using an API key (session-only endpoints)', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E No Bearer Management App',
        permission: 'read_write',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<CreateKeyResponse>(keyResponse);

    const bearerListResponse = await request.get('/api/v1/apps', {
      params: { workspaceId: SEED.workspace.id },
      headers: { Authorization: `Bearer ${key.secret}`, Cookie: '' },
    });
    expect(bearerListResponse.status()).toBe(401);
  });
});
