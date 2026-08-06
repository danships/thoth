import { describe, expect, test } from 'vitest';
import { createBearerClient, getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

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

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('apps management API', () => {
  test('can create, list, update and archive an App scoped to the whole workspace', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Whole Workspace App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    expect(createResponse.ok).toBe(true);
    const created = await getData<AppApi>(createResponse);
    expect(created.label).toBe('E2E Whole Workspace App');
    expect(created.scopeType).toBe('workspace');
    expect(created.keyCount).toBe(0);

    const listResponse = await client.get('/api/v1/apps', { params: { workspaceId: SEED.workspace.id } });
    expect(listResponse.ok).toBe(true);
    const { apps } = await getData<{ apps: AppApi[] }>(listResponse);
    expect(apps.some((app) => app.id === created.id)).toBe(true);

    const patchResponse = await client.patch(`/api/v1/apps/${created.id}`, {
      label: 'E2E Renamed App',
      permission: 'read_write',
    });
    expect(patchResponse.ok).toBe(true);
    const updated = await getData<AppApi>(patchResponse);
    expect(updated.label).toBe('E2E Renamed App');
    expect(updated.permission).toBe('read_write');

    const archiveResponse = await client.delete(`/api/v1/apps/${created.id}`);
    expect(archiveResponse.status).toBe(204);

    const detailResponse = await client.get(`/api/v1/apps/${created.id}`);
    const detail = await getData<AppApi>(detailResponse);
    expect(detail.archivedAt).not.toBeNull();
  });

  test('allows creating an App scoped to specific containers with an empty scope (pages are attached later, from the page itself)', async () => {
    const client = await getOwner();

    const response = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Empty Scope App',
      permission: 'read',
      scopeType: 'containers',
      attributionMode: 'creator',
    });
    expect(response.ok).toBe(true);
    const created = await getData<AppApi & { containers?: { id: string }[] }>(response);
    expect(created.scopeType).toBe('containers');
    expect(created.containers ?? []).toHaveLength(0);
  });

  test('can scope an App to specific containers', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Scoped App',
      permission: 'read',
      scopeType: 'containers',
      attributionMode: 'creator',
      containerIds: [SEED.pages.root.id],
    });
    expect(createResponse.ok).toBe(true);
    const created = await getData<AppApi & { containers?: { id: string }[] }>(createResponse);
    expect(created.containers?.map((container) => container.id)).toContain(SEED.pages.root.id);
  });

  test('mints a one-time key secret, then supports rotation (mint + revoke old)', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Key Rotation App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);

    const firstKeyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, { label: 'prod' });
    expect(firstKeyResponse.ok).toBe(true);
    const firstKey = await getData<CreateKeyResponse>(firstKeyResponse);
    expect(firstKey.secret).toMatch(/^thk_/);
    expect(firstKey.keyPrefix).toBe(firstKey.secret.slice(0, 12));

    const secondKeyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, { label: 'prod-2' });
    const secondKey = await getData<CreateKeyResponse>(secondKeyResponse);
    expect(secondKey.secret).not.toBe(firstKey.secret);

    const revokeResponse = await client.delete(`/api/v1/apps/${app.id}/keys/${firstKey.id}`);
    expect(revokeResponse.status).toBe(204);

    const detailResponse = await client.get(`/api/v1/apps/${app.id}`);
    const detail = await getData<{ keys: ApiKeyApi[] }>(detailResponse);
    const revokedKey = detail.keys.find((key) => key.id === firstKey.id);
    const activeKey = detail.keys.find((key) => key.id === secondKey.id);
    expect(revokedKey?.revokedAt).not.toBeNull();
    expect(activeKey?.revokedAt).toBeNull();
  });

  test('rejects minting a key with a non-future expiresAt', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Expiry Validation App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);

    const response = await client.post(`/api/v1/apps/${app.id}/keys`, {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(response.status).toBe(400);
  });

  test('archiving an App cascades to revoke all of its keys', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Cascade Archive App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);

    const keyOneResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const keyOne = await getData<CreateKeyResponse>(keyOneResponse);
    const keyTwoResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const keyTwo = await getData<CreateKeyResponse>(keyTwoResponse);

    const archiveResponse = await client.delete(`/api/v1/apps/${app.id}`);
    expect(archiveResponse.status).toBe(204);

    const detailResponse = await client.get(`/api/v1/apps/${app.id}`);
    const detail = await getData<{ keys: ApiKeyApi[] }>(detailResponse);
    expect(detail.keys.find((key) => key.id === keyOne.id)?.revokedAt).not.toBeNull();
    expect(detail.keys.find((key) => key.id === keyTwo.id)?.revokedAt).not.toBeNull();

    const mintAfterArchiveResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    expect(mintAfterArchiveResponse.status).toBe(409);
  });

  test('cannot manage an App using an API key (session-only endpoints)', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Session Only App',
      permission: 'read_write',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);
    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<CreateKeyResponse>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const bearerListResponse = await bearerClient.get('/api/v1/apps', {
      params: { workspaceId: SEED.workspace.id },
    });
    expect(bearerListResponse.status).toBe(401);
  });
});
