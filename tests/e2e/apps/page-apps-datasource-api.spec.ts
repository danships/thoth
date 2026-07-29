import type { APIResponse } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

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

// Covers the fix where App scope must reach the data source (and its rows) embedded on a page:
// `containers_with_children` reaches a data-view row page as a descendant, and connecting any
// App to a host page implicitly grants it access to the data sources shown on that page — data
// sources are never granted on their own.
test.describe('page-scoped Apps: data-source access', () => {
  test('a containers_with_children App scoped to a host page shows its data-view row page as connected via inheritance', async ({
    request,
  }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: `E2E DS Inheritance ${Date.now()}`,
        permission: 'read',
        scopeType: 'containers_with_children',
        attributionMode: 'creator',
        containerIds: [SEED.pages.dataSourceHost.id],
      },
    });
    const app = await getData<{ id: string }>(createResponse);

    // The row page lives under the data source (`parentId = dataSourceId`), which is only linked
    // to the host page via its data view — so it's reachable only through the view bridge.
    const listResponse = await request.get(`/api/v1/pages/${SEED.dataSourcePage.id}/apps`);
    expect(listResponse.ok()).toBeTruthy();
    const { connected, connectable } = await getData<PageAppsResponse>(listResponse);

    const connectedEntry = connected.find((entry) => entry.id === app.id);
    expect(connectedEntry).toBeTruthy();
    expect(connectedEntry?.viaInheritance).toBe(true);
    expect(connectable.some((entry) => entry.id === app.id)).toBeFalsy();
  });

  test('connecting a containers-scope App to a host page implicitly grants it access to the embedded data source, but not unrelated containers', async ({
    request,
  }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: `E2E DS Implicit ${Date.now()}`,
        permission: 'read',
        scopeType: 'containers',
        attributionMode: 'creator',
      },
    });
    const app = await getData<{ id: string }>(createResponse);

    // Connect the App to the host page only — no data-source grant is created.
    const connectResponse = await request.post(`/api/v1/pages/${SEED.pages.dataSourceHost.id}/apps`, {
      data: { appId: app.id },
    });
    expect(connectResponse.ok()).toBeTruthy();

    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      // The data source embedded on the host page is implicitly readable.
      const dataSourceResponse = await bearerContext.get(`/api/v1/data-sources/${SEED.dataSource.id}`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(dataSourceResponse.ok()).toBeTruthy();

      // An unrelated container the App was never granted is still forbidden.
      const outOfScopeResponse = await bearerContext.get(`/api/v1/pages/${SEED.pages.root.id}`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(outOfScopeResponse.status()).toBe(403);
    } finally {
      await bearerContext.dispose();
    }
  });
});
