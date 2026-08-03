import type { APIResponse } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

// Covers THOTH-048: appending `.md` to a page's detail URL returns the page's raw Markdown body
// (`text/markdown`) instead of rendering the React app shell. `proxy.ts` rewrites the request to
// the dedicated `GET /api/v1/pages/{id}/markdown` route, so both the workspace-scoped URL and the
// legacy bare `/pages/{id}.md` URL are covered here, alongside both supported auth paths (the
// session cookie, via the shared `request` fixture, and an App's `Authorization: ******
// bearer token, via a cookie-less `APIRequestContext`).
test.describe('.md page detail URL', () => {
  test('returns the raw Markdown body for the workspace-scoped URL, via session cookie', async ({ request }) => {
    const response = await request.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/markdown');

    const body = await response.text();
    expect(body).toContain(SEED.pages.root.contentHeading);
  });

  test('returns the raw Markdown body for the legacy bare URL, via session cookie', async ({ request }) => {
    const response = await request.get(`/pages/${SEED.pages.root.id}.md`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/markdown');

    const body = await response.text();
    expect(body).toContain(SEED.pages.root.contentHeading);
  });

  test('is rejected with 401 when neither a session cookie nor a bearer token is present', async () => {
    const anonymousContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const response = await anonymousContext.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`);
      expect(response.status()).toBe(401);
    } finally {
      await anonymousContext.dispose();
    }
  });

  test('returns the raw Markdown body for a workspace-scoped App API key (bearer auth)', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Markdown URL Read App',
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
      const response = await bearerContext.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['content-type']).toContain('text/markdown');

      const body = await response.text();
      expect(body).toContain(SEED.pages.root.contentHeading);
    } finally {
      await bearerContext.dispose();
    }
  });

  test('an App key scoped to an unrelated container is rejected (403)', async ({ request }) => {
    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Markdown URL Scoped App',
        permission: 'read',
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
      const response = await bearerContext.get(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}.md`, {
        headers: { Authorization: `Bearer ${key.secret}` },
      });
      expect(response.status()).toBe(403);
    } finally {
      await bearerContext.dispose();
    }
  });
});
