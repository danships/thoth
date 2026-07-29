import type { APIResponse } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

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

// Covers THOTH-026 feedback: a page's App scope is managed from the page itself
// (`GET/POST /pages/:id/apps`, `DELETE /pages/:id/apps/:appId`) rather than from the App
// settings form, which no longer accepts page ids at all.
test.describe('page-scoped Apps API', () => {
  test('a workspace-scoped App always shows up as connected (not disconnectable)', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Page Apps Workspace Scoped',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);

    const listResponse = await request.get(`/api/v1/pages/${SEED.pages.root.id}/apps`);
    expect(listResponse.ok()).toBeTruthy();
    const { connected, connectable } = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(
      listResponse
    );

    const connectedEntry = connected.find((entry) => entry.id === app.id);
    expect(connectedEntry?.viaWorkspace).toBe(true);
    expect(connectable.some((entry) => entry.id === app.id)).toBeFalsy();
  });

  test('a containers-scoped App can be connected to and disconnected from a page', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Page Apps Connect Flow',
        permission: 'read',
        scopeType: 'containers',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);

    const beforeConnectResponse = await request.get(`/api/v1/pages/${SEED.pages.child.id}/apps`);
    const before = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(beforeConnectResponse);
    expect(before.connectable.some((entry) => entry.id === app.id)).toBeTruthy();
    expect(before.connected.some((entry) => entry.id === app.id)).toBeFalsy();

    const connectResponse = await request.post(`/api/v1/pages/${SEED.pages.child.id}/apps`, {
      data: { appId: app.id },
    });
    expect(connectResponse.ok()).toBeTruthy();

    const afterConnectResponse = await request.get(`/api/v1/pages/${SEED.pages.child.id}/apps`);
    const after = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(afterConnectResponse);
    expect(after.connected.some((entry) => entry.id === app.id)).toBeTruthy();
    expect(after.connectable.some((entry) => entry.id === app.id)).toBeFalsy();

    const disconnectResponse = await request.delete(`/api/v1/pages/${SEED.pages.child.id}/apps/${app.id}`);
    expect(disconnectResponse.status()).toBe(204);

    const afterDisconnectResponse = await request.get(`/api/v1/pages/${SEED.pages.child.id}/apps`);
    const afterDisconnect = await getData<{ connected: PageAppSummary[]; connectable: PageAppSummary[] }>(
      afterDisconnectResponse
    );
    expect(afterDisconnect.connected.some((entry) => entry.id === app.id)).toBeFalsy();
    expect(afterDisconnect.connectable.some((entry) => entry.id === app.id)).toBeTruthy();
  });

  test('cannot connect an already-workspace-scoped App to a page', async ({ request }) => {
    const createResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Page Apps Reject Workspace',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(createResponse);

    const connectResponse = await request.post(`/api/v1/pages/${SEED.pages.root.id}/apps`, {
      data: { appId: app.id },
    });
    expect(connectResponse.status()).toBe(400);
  });

  test('managing page-scoped Apps requires a session (bearer tokens are rejected)', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Page Apps No Bearer',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);
    const authorizationHeader = 'Bearer ' + key.secret;

    // A cookie-less context so the only credential in play is the bearer token itself — this
    // route (like the rest of `/apps*`) must reject it even when it's a genuinely valid key.
    const bearerContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const listResponse = await bearerContext.get(`/api/v1/pages/${SEED.pages.root.id}/apps`, {
        headers: { Authorization: authorizationHeader },
      });
      expect(listResponse.status()).toBe(401);
    } finally {
      await bearerContext.dispose();
    }
  });
});
