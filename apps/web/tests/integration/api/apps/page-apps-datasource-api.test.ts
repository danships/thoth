import { describe, expect, test } from 'vitest';
import { createBearerClient, getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

type PageAppSummary = {
  id: string;
  label: string;
  scopeType: 'workspace' | 'containers' | 'containers_with_children';
  viaWorkspace?: boolean;
  viaInheritance?: boolean;
};

type PageAppsResponse = {
  connected: PageAppSummary[];
  connectable: PageAppSummary[];
};

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('page-scoped Apps: data-source access', () => {
  test('a containers_with_children App scoped to a host page shows its data-view row page as connected via inheritance', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: `E2E DS Inheritance ${Date.now()}`,
      permission: 'read',
      scopeType: 'containers_with_children',
      attributionMode: 'creator',
      containerIds: [SEED.pages.dataSourceHost.id],
    });
    const app = await getData<{ id: string }>(createResponse);

    const listResponse = await client.get(`/api/v1/pages/${SEED.dataSourcePage.id}/apps`);
    expect(listResponse.ok).toBe(true);
    const { connected, connectable } = await getData<PageAppsResponse>(listResponse);

    const connectedEntry = connected.find((entry) => entry.id === app.id);
    expect(connectedEntry).toBeTruthy();
    expect(connectedEntry?.viaInheritance).toBe(true);
    expect(connectable.some((entry) => entry.id === app.id)).toBe(false);
  });

  test('connecting a containers-scope App to a host page implicitly grants it access to the embedded data source, but not unrelated containers', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: `E2E DS Implicit ${Date.now()}`,
      permission: 'read',
      scopeType: 'containers',
      attributionMode: 'creator',
    });
    const app = await getData<{ id: string }>(createResponse);

    const connectResponse = await client.post(`/api/v1/pages/${SEED.pages.dataSourceHost.id}/apps`, { appId: app.id });
    expect(connectResponse.ok).toBe(true);

    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<{ secret: string }>(keyResponse);
    const bearerClient = createBearerClient(getBaseUrl(), key.secret);

    const dataSourceResponse = await bearerClient.get(`/api/v1/data-sources/${SEED.dataSource.id}`);
    expect(dataSourceResponse.ok).toBe(true);

    const outOfScopeResponse = await bearerClient.get(`/api/v1/pages/${SEED.pages.root.id}`);
    expect(outOfScopeResponse.status).toBe(403);
  });
});
