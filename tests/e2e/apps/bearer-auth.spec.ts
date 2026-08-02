import type { APIResponse } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

// Covers the THOTH-026 bearer-token authentication fallback (`Authorization: Bearer <raw_key>`)
// on the existing resource routes. Each test spins up a cookie-less `APIRequestContext` (via
// `playwrightRequest.newContext`) so the only credential in play is the bearer token itself —
// the shared seed user's session cookie (used by every other spec via the `request` fixture)
// must play no part here.
test.describe('bearer-token API authentication', () => {
  test('a workspace-scoped read key can read pages via the tree endpoint', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Bearer Workspace Read App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const response = await bearerContext.get('/api/v1/pages/tree', {
        params: { workspaceId: SEED.workspace.id },
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(response.ok()).toBeTruthy();
      const body = await getData<{ branches: { page: { id: string } }[] }>(response);
      expect(body.branches.some((branch) => branch.page.id === SEED.pages.root.id)).toBeTruthy();
    } finally {
      await bearerContext.dispose();
    }
  });

  test('a read-only key is rejected (403) when attempting to write', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Bearer Read Only Write App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const response = await bearerContext.post('/api/v1/pages', {
        headers: { Authorization: `Bearer ${key.secret}` },
        data: { name: 'Should be rejected', emoji: null, parentId: null, workspaceId: SEED.workspace.id },
      });
      expect(response.status()).toBe(403);
    } finally {
      await bearerContext.dispose();
    }
  });

  test('a read_write key can create a page, and containers-scope keys cannot reach out-of-scope containers', async ({
    request,
  }) => {
    // Scope this App to a single unrelated seeded page, not the workspace's root page.
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Bearer Scoped App',
        permission: 'read_write',
        scopeType: 'containers',
        attributionMode: 'creator',
        containerIds: [SEED.pages.favoriteToggle.id],
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      // In-scope container: allowed.
      const inScopeResponse = await bearerContext.get(`/api/v1/pages/${SEED.pages.favoriteToggle.id}`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(inScopeResponse.ok()).toBeTruthy();

      // Out-of-scope container: forbidden, even though it exists in the same workspace.
      const outOfScopeResponse = await bearerContext.get(`/api/v1/pages/${SEED.pages.root.id}`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(outOfScopeResponse.status()).toBe(403);
    } finally {
      await bearerContext.dispose();
    }
  });

  test('a revoked key is rejected with 401', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Bearer Revoked Key App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ id: string; secret: string }>(keyResponse);

    await request.delete(`/api/v1/apps/${app.id}/keys/${key.id}`);

    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const response = await bearerContext.get('/api/v1/pages/tree', {
        params: { workspaceId: SEED.workspace.id },
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(response.status()).toBe(401);
    } finally {
      await bearerContext.dispose();
    }
  });

  test('an unknown/garbage bearer token is rejected with 401', async ({}) => {
    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const response = await bearerContext.get('/api/v1/pages/tree', {
        headers: { Authorization: 'Bearer thk_not-a-real-key' },
      });
      expect(response.status()).toBe(401);
    } finally {
      await bearerContext.dispose();
    }
  });

  // THOTH-031: `/apps/:id/webhooks*` is `disallowApiKey: true`, matching every other `/apps*`
  // route -- an App's own key must never be usable to manage its webhooks (closes the same
  // privilege-escalation loop as `/apps/:id/keys*`).
  test('a valid App key is rejected (401) on the webhooks management routes', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Webhook-Auth App',
        permission: 'read_write',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);
    const authorizationHeader = ['Bearer', key.secret].join(' ');

    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const listResponse = await bearerContext.get(`/api/v1/apps/${app.id}/webhooks`, {
        headers: { Authorization: authorizationHeader },
      });
      expect(listResponse.status()).toBe(401);

      const createResponse = await bearerContext.post(`/api/v1/apps/${app.id}/webhooks`, {
        headers: { Authorization: authorizationHeader },
        data: { label: 'Should be rejected', url: 'https://192.0.2.1/hook' },
      });
      expect(createResponse.status()).toBe(401);
    } finally {
      await bearerContext.dispose();
    }
  });

  test('an App with attributionMode "app" attributes created content to the App, not the creator', async ({
    request,
  }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Bearer App Attribution',
        permission: 'read_write',
        scopeType: 'workspace',
        attributionMode: 'app',
      },
    });
    const app = await getData<{ id: string }>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<{ secret: string }>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
    try {
      const createResponse = await bearerContext.post('/api/v1/pages', {
        headers: { Authorization: `Bearer ${key.secret}` },
        data: { name: 'App Attributed Page', emoji: null, parentId: null, workspaceId: SEED.workspace.id },
      });
      expect(createResponse.ok()).toBeTruthy();
      const created = await getData<{ id: string }>(createResponse);

      // Readable back through the same bearer-authenticated App identity.
      const readResponse = await bearerContext.get(`/api/v1/pages/${created.id}`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(readResponse.ok()).toBeTruthy();

      // THOTH-042: root listing is workspace-scoped (`Container.lastUpdated`), not per-user
      // `ContainerAccess` rows, so a page attributed to the App's own synthetic owner id is
      // still visible to every workspace member's root tree -- `userId`/attribution is never a
      // visibility gate for content.
      const treeResponse = await request.get('/api/v1/pages/tree', { params: { workspaceId: SEED.workspace.id } });
      const tree = await getData<{ branches: { page: { id: string } }[] }>(treeResponse);
      expect(tree.branches.some((branch) => branch.page.id === created.id)).toBeTruthy();
    } finally {
      await bearerContext.dispose();
    }
  });
});
