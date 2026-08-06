import { describe, expect, test } from 'vitest';
import { createBearerClient, getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

type AppApi = {
  id: string;
  scopeType: 'workspace' | 'containers' | 'containers_with_children';
};

type PageAppSummary = {
  id: string;
  label: string;
  scopeType: 'workspace' | 'containers' | 'containers_with_children';
  viaWorkspace?: boolean;
};

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('page-scoped Apps API', () => {
  test('a workspace-scoped App always shows up as connected (not disconnectable)', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Page Apps Workspace Scoped',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);

    const listResponse = await client.get(`/api/v1/pages/${SEED.pages.root.id}/apps`);
    expect(listResponse.ok).toBe(true);
    const { connected, connectable } = await getData<{
      connected: PageAppSummary[];
      connectable: PageAppSummary[];
    }>(listResponse);

    const connectedEntry = connected.find((entry) => entry.id === app.id);
    expect(connectedEntry?.viaWorkspace).toBe(true);
    expect(connectable.some((entry) => entry.id === app.id)).toBe(false);
  });

  test('a containers-scoped App can be connected to and disconnected from a page', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Page Apps Connect Flow',
      permission: 'read',
      scopeType: 'containers',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);

    const beforeConnectResponse = await client.get(`/api/v1/pages/${SEED.pages.child.id}/apps`);
    const before = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(beforeConnectResponse);
    expect(before.connectable.some((entry) => entry.id === app.id)).toBe(true);
    expect(before.connected.some((entry) => entry.id === app.id)).toBe(false);

    const connectResponse = await client.post(`/api/v1/pages/${SEED.pages.child.id}/apps`, { appId: app.id });
    expect(connectResponse.ok).toBe(true);

    const afterConnectResponse = await client.get(`/api/v1/pages/${SEED.pages.child.id}/apps`);
    const after = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(afterConnectResponse);
    expect(after.connected.some((entry) => entry.id === app.id)).toBe(true);
    expect(after.connectable.some((entry) => entry.id === app.id)).toBe(false);

    const disconnectResponse = await client.delete(`/api/v1/pages/${SEED.pages.child.id}/apps/${app.id}`);
    expect(disconnectResponse.status).toBe(204);

    const afterDisconnectResponse = await client.get(`/api/v1/pages/${SEED.pages.child.id}/apps`);
    const afterDisconnect = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(
      afterDisconnectResponse
    );
    expect(afterDisconnect.connected.some((entry) => entry.id === app.id)).toBe(false);
    expect(afterDisconnect.connectable.some((entry) => entry.id === app.id)).toBe(true);
  });

  test('cannot connect an already-workspace-scoped App to a page', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Page Apps Reject Workspace',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(createResponse);

    const connectResponse = await client.post(`/api/v1/pages/${SEED.pages.root.id}/apps`, { appId: app.id });
    expect(connectResponse.status).toBe(400);
  });

  test('managing page-scoped Apps requires a session (bearer tokens are rejected)', async () => {
    const client = await getOwner();

    const appResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Page Apps No Bearer',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerClient = createBearerClient(getBaseUrl(), key.secret);
    const listResponse = await bearerClient.get(`/api/v1/pages/${SEED.pages.root.id}/apps`);
    expect(listResponse.status).toBe(401);
  });
});
