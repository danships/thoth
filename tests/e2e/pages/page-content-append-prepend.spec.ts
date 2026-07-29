import type { APIResponse } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

type PageApi = { id: string };
type PageDetails = { page: { lastUpdated: string } };
type ContentResponse = { content: string };
type AppApi = { id: string };
type ApiKeyApi = { secret: string };

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

async function createPage(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const response = await request.post('/api/v1/pages', {
    data: { name: 'E2E Append Prepend Page', emoji: null, parentId: null, workspaceId: SEED.workspace.id },
  });
  expect(response.ok()).toBeTruthy();
  const page = await getData<PageApi>(response);
  return page.id;
}

// Covers THOTH-032: `POST /pages/:id/append` and `POST /pages/:id/prepend`, which concatenate
// content onto a page's existing markdown body server-side instead of requiring a client-side
// GET -> splice -> PUT round trip. Each test creates a fresh page via the API so seeded, shared
// pages used by other specs are never mutated.
test.describe('page content append/prepend API', () => {
  test('append to an empty page sets the content', async ({ request }) => {
    const pageId = await createPage(request);

    const response = await request.post(`/api/v1/pages/${pageId}/append`, { data: { content: 'Hello' } });
    expect(response.ok()).toBeTruthy();
    const { content } = await getData<ContentResponse>(response);
    expect(content).toBe('Hello');
  });

  test('append preserves order at the end', async ({ request }) => {
    const pageId = await createPage(request);
    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'A' } });

    const response = await request.post(`/api/v1/pages/${pageId}/append`, { data: { content: 'B' } });
    expect(response.ok()).toBeTruthy();
    const { content } = await getData<ContentResponse>(response);
    expect(content).toBe('A\nB');
  });

  test('prepend adds at the start', async ({ request }) => {
    const pageId = await createPage(request);
    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'A' } });

    const response = await request.post(`/api/v1/pages/${pageId}/prepend`, { data: { content: 'Z' } });
    expect(response.ok()).toBeTruthy();
    const { content } = await getData<ContentResponse>(response);
    expect(content).toBe('Z\nA');
  });

  test('append then prepend combine correctly and match a follow-up GET', async ({ request }) => {
    const pageId = await createPage(request);
    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'A' } });

    const appendResponse = await request.post(`/api/v1/pages/${pageId}/append`, { data: { content: 'B' } });
    const appendResult = await getData<ContentResponse>(appendResponse);
    expect(appendResult.content).toBe('A\nB');

    const prependResponse = await request.post(`/api/v1/pages/${pageId}/prepend`, { data: { content: 'Z' } });
    const prependResult = await getData<ContentResponse>(prependResponse);
    expect(prependResult.content).toBe('Z\nA\nB');

    const getResponse = await request.get(`/api/v1/pages/${pageId}/content`);
    const getResult = await getData<ContentResponse>(getResponse);
    expect(getResult.content).toBe('Z\nA\nB');
  });

  test('a read_write App API key can append and prepend', async ({ request }) => {
    const pageId = await createPage(request);
    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'A' } });

    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Append/Prepend Write App',
        permission: 'read_write',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<ApiKeyApi>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const appendResponse = await bearerContext.post(`/api/v1/pages/${pageId}/append`, {
        headers: { Authorization: `Bearer ${key.secret}` },
        data: { content: 'B' },
      });
      expect(appendResponse.ok()).toBeTruthy();
      const appendResult = await getData<ContentResponse>(appendResponse);
      expect(appendResult.content).toBe('A\nB');

      const prependResponse = await bearerContext.post(`/api/v1/pages/${pageId}/prepend`, {
        headers: { Authorization: `Bearer ${key.secret}` },
        data: { content: 'Z' },
      });
      expect(prependResponse.ok()).toBeTruthy();
      const prependResult = await getData<ContentResponse>(prependResponse);
      expect(prependResult.content).toBe('Z\nA\nB');
    } finally {
      await bearerContext.dispose();
    }
  });

  test('a read-only App API key is rejected with 403 on append and prepend', async ({ request }) => {
    const pageId = await createPage(request);
    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'A' } });

    const appResponse = await request.post('/api/v1/apps', {
      data: {
        workspaceId: SEED.workspace.id,
        label: 'E2E Append/Prepend Read Only App',
        permission: 'read',
        scopeType: 'workspace',
        attributionMode: 'creator',
      },
    });
    const app = await getData<AppApi>(appResponse);
    const keyResponse = await request.post(`/api/v1/apps/${app.id}/keys`, { data: {} });
    const key = await getData<ApiKeyApi>(keyResponse);

    const bearerContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const appendResponse = await bearerContext.post(`/api/v1/pages/${pageId}/append`, {
        headers: { Authorization: `Bearer ${key.secret}` },
        data: { content: 'B' },
      });
      expect(appendResponse.status()).toBe(403);

      const prependResponse = await bearerContext.post(`/api/v1/pages/${pageId}/prepend`, {
        headers: { Authorization: `Bearer ${key.secret}` },
        data: { content: 'Z' },
      });
      expect(prependResponse.status()).toBe(403);

      const getResponse = await request.get(`/api/v1/pages/${pageId}/content`);
      const getResult = await getData<ContentResponse>(getResponse);
      expect(getResult.content).toBe('A');
    } finally {
      await bearerContext.dispose();
    }
  });

  test('no auth returns 401 for append and prepend', async ({ request }) => {
    const pageId = await createPage(request);

    const noAuthContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const appendResponse = await noAuthContext.post(`/api/v1/pages/${pageId}/append`, { data: { content: 'B' } });
      expect(appendResponse.status()).toBe(401);

      const prependResponse = await noAuthContext.post(`/api/v1/pages/${pageId}/prepend`, { data: { content: 'Z' } });
      expect(prependResponse.status()).toBe(401);
    } finally {
      await noAuthContext.dispose();
    }
  });

  test('a non-existent page id returns 404 for append and prepend', async ({ request }) => {
    const appendResponse = await request.post('/api/v1/pages/e2e-nonexistent-page-id/append', {
      data: { content: 'B' },
    });
    expect(appendResponse.status()).toBe(404);

    const prependResponse = await request.post('/api/v1/pages/e2e-nonexistent-page-id/prepend', {
      data: { content: 'Z' },
    });
    expect(prependResponse.status()).toBe(404);
  });

  test('an invalid body returns 400 for append and prepend', async ({ request }) => {
    const pageId = await createPage(request);

    const missingContentAppend = await request.post(`/api/v1/pages/${pageId}/append`, { data: {} });
    expect(missingContentAppend.status()).toBe(400);

    const wrongTypeAppend = await request.post(`/api/v1/pages/${pageId}/append`, {
      data: { content: 12_345 },
    });
    expect(wrongTypeAppend.status()).toBe(400);

    const missingContentPrepend = await request.post(`/api/v1/pages/${pageId}/prepend`, { data: {} });
    expect(missingContentPrepend.status()).toBe(400);

    const wrongTypePrepend = await request.post(`/api/v1/pages/${pageId}/prepend`, {
      data: { content: 12_345 },
    });
    expect(wrongTypePrepend.status()).toBe(400);
  });

  test('lastUpdated is bumped by append', async ({ request }) => {
    const pageId = await createPage(request);

    const before = await getData<PageDetails>(await request.get(`/api/v1/pages/${pageId}`));

    await new Promise((resolve) => setTimeout(resolve, 10));
    await request.post(`/api/v1/pages/${pageId}/append`, { data: { content: 'B' } });

    const after = await getData<PageDetails>(await request.get(`/api/v1/pages/${pageId}`));
    expect(new Date(after.page.lastUpdated).getTime()).toBeGreaterThan(new Date(before.page.lastUpdated).getTime());
  });

  test('an empty content string is an accepted no-op that still bumps lastUpdated', async ({ request }) => {
    const pageId = await createPage(request);
    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'A' } });

    const before = await getData<PageDetails>(await request.get(`/api/v1/pages/${pageId}`));

    await new Promise((resolve) => setTimeout(resolve, 10));
    const response = await request.post(`/api/v1/pages/${pageId}/append`, { data: { content: '' } });
    expect(response.ok()).toBeTruthy();
    const result = await getData<ContentResponse>(response);
    expect(result.content).toBe('A');

    const after = await getData<PageDetails>(await request.get(`/api/v1/pages/${pageId}`));
    expect(new Date(after.page.lastUpdated).getTime()).toBeGreaterThan(new Date(before.page.lastUpdated).getTime());
  });
});
