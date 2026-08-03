import { describe, expect, test } from 'vitest';
import { createBearerClient, getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('bearer-token API authentication', () => {
  test('a workspace-scoped read key can read pages via the tree endpoint', async () => {
    const owner = await getOwner();

    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Bearer Read App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const response = await bearerClient.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.workspace.id },
    });
    expect(response.ok).toBe(true);
    const body = await getData<{ branches: { page: { id: string } }[] }>(response);
    expect(body.branches.some((branch) => branch.page.id === SEED.pages.root.id)).toBe(true);
  });

  test('a read-only key is rejected (403) when attempting to write', async () => {
    const owner = await getOwner();

    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Read Only Write App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const response = await bearerClient.post('/api/v1/pages', {
      name: 'Should be rejected',
      emoji: null,
      parentId: null,
      workspaceId: SEED.workspace.id,
    });
    expect(response.status).toBe(403);
  });

  test('a read_write key can create a page, and containers-scope keys cannot reach out-of-scope containers', async () => {
    const owner = await getOwner();

    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Bearer Scoped App',
      permission: 'read_write',
      scopeType: 'containers',
      attributionMode: 'creator',
      containerIds: [SEED.pages.favoriteToggle.id],
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const inScopeResponse = await bearerClient.get(`/api/v1/pages/${SEED.pages.favoriteToggle.id}`);
    expect(inScopeResponse.ok).toBe(true);

    const outOfScopeResponse = await bearerClient.get(`/api/v1/pages/${SEED.pages.root.id}`);
    expect(outOfScopeResponse.status).toBe(403);
  });

  test('a revoked key is rejected with 401', async () => {
    const owner = await getOwner();

    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Revoked Key App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ id: string; secret: string }>(keyResponse);

    await owner.delete(`/api/v1/apps/${app.id}/keys/${key.id}`);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const response = await bearerClient.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.workspace.id },
    });
    expect(response.status).toBe(401);
  });

  test('an unknown/garbage bearer token is rejected with 401', async () => {
    const bearerClient = createBearerClient(getBaseUrl(), 'definitely-not-a-real-token');
    const response = await bearerClient.get('/api/v1/pages/tree');
    expect(response.status).toBe(401);
  });

  test('a valid App key is rejected (401) on the webhooks management routes', async () => {
    const owner = await getOwner();

    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Webhook-Auth App',
      permission: 'read_write',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const listResponse = await bearerClient.get(`/api/v1/apps/${app.id}/webhooks`);
    expect(listResponse.status).toBe(401);

    const createResponse = await bearerClient.post(`/api/v1/apps/${app.id}/webhooks`, {
      label: 'Should be rejected',
      url: 'https://192.0.2.1/hook',
    });
    expect(createResponse.status).toBe(401);
  });

  test('an App with attributionMode "app" attributes created content to the App, not the creator', async () => {
    const owner = await getOwner();

    const appResponse = await owner.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Bearer Attribution',
      permission: 'read_write',
      scopeType: 'workspace',
      attributionMode: 'app',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await owner.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const createResponse = await bearerClient.post('/api/v1/pages', {
      name: 'App Attributed Page',
      emoji: null,
      parentId: null,
      workspaceId: SEED.workspace.id,
    });
    expect(createResponse.ok).toBe(true);
    const created = await getData<{ id: string }>(createResponse);

    const readResponse = await bearerClient.get(`/api/v1/pages/${created.id}`);
    expect(readResponse.ok).toBe(true);

    const treeResponse = await owner.get('/api/v1/pages/tree', { params: { workspaceId: SEED.workspace.id } });
    const tree = await getData<{ branches: { page: { id: string } }[] }>(treeResponse);
    expect(tree.branches.some((branch) => branch.page.id === created.id)).toBe(true);
  });
});
