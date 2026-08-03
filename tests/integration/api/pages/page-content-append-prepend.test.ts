import { describe, expect, test } from 'vitest';
import {
  createAnonymousClient,
  createBearerClient,
  getBaseUrl,
  getData,
  getOwnerClient,
  SEED,
} from '../../support/fixtures';

type PageApi = { id: string };
type PageDetails = { page: { lastUpdated: string } };
type ContentResponse = { content: string };
type AppApi = { id: string };
type ApiKeyApi = { secret: string };

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function createPage(): Promise<string> {
  const client = await getOwner();
  const response = await client.post('/api/v1/pages', {
    name: 'E2E Append Prepend Page',
    emoji: null,
    parentId: null,
    workspaceId: SEED.workspace.id,
  });
  expect(response.ok).toBe(true);
  const page = await getData<PageApi>(response);
  return page.id;
}

describe('page content append/prepend API', () => {
  test('append to an empty page sets the content', async () => {
    const client = await getOwner();
    const pageId = await createPage();

    const response = await client.post(`/api/v1/pages/${pageId}/append`, { content: 'Hello' });
    expect(response.ok).toBe(true);
    const { content } = await getData<ContentResponse>(response);
    expect(content).toBe('Hello');
  });

  test('append preserves order at the end', async () => {
    const client = await getOwner();
    const pageId = await createPage();
    await client.post(`/api/v1/pages/${pageId}/content`, { content: 'A' });

    const response = await client.post(`/api/v1/pages/${pageId}/append`, { content: 'B' });
    expect(response.ok).toBe(true);
    const { content } = await getData<ContentResponse>(response);
    expect(content).toBe('A\nB');
  });

  test('prepend adds at the start', async () => {
    const client = await getOwner();
    const pageId = await createPage();
    await client.post(`/api/v1/pages/${pageId}/content`, { content: 'A' });

    const response = await client.post(`/api/v1/pages/${pageId}/prepend`, { content: 'Z' });
    expect(response.ok).toBe(true);
    const { content } = await getData<ContentResponse>(response);
    expect(content).toBe('Z\nA');
  });

  test('append then prepend combine correctly and match a follow-up GET', async () => {
    const client = await getOwner();
    const pageId = await createPage();
    await client.post(`/api/v1/pages/${pageId}/content`, { content: 'A' });

    const appendResponse = await client.post(`/api/v1/pages/${pageId}/append`, { content: 'B' });
    const appendResult = await getData<ContentResponse>(appendResponse);
    expect(appendResult.content).toBe('A\nB');

    const prependResponse = await client.post(`/api/v1/pages/${pageId}/prepend`, { content: 'Z' });
    const prependResult = await getData<ContentResponse>(prependResponse);
    expect(prependResult.content).toBe('Z\nA\nB');

    const getResponse = await client.get(`/api/v1/pages/${pageId}/content`);
    const getResult = await getData<ContentResponse>(getResponse);
    expect(getResult.content).toBe('Z\nA\nB');
  });

  test('a read_write App API key can append and prepend', async () => {
    const client = await getOwner();
    const pageId = await createPage();
    await client.post(`/api/v1/pages/${pageId}/content`, { content: 'A' });

    const appResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Append/Prepend Write App',
      permission: 'read_write',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(appResponse);
    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<ApiKeyApi>(keyResponse);
    const bearerClient = createBearerClient(getBaseUrl(), key.secret);

    const appendResponse = await bearerClient.post(`/api/v1/pages/${pageId}/append`, { content: 'B' });
    expect(appendResponse.ok).toBe(true);
    const appendResult = await getData<ContentResponse>(appendResponse);
    expect(appendResult.content).toBe('A\nB');

    const prependResponse = await bearerClient.post(`/api/v1/pages/${pageId}/prepend`, { content: 'Z' });
    expect(prependResponse.ok).toBe(true);
    const prependResult = await getData<ContentResponse>(prependResponse);
    expect(prependResult.content).toBe('Z\nA\nB');
  });

  test('a read-only App API key is rejected with 403 on append and prepend', async () => {
    const client = await getOwner();
    const pageId = await createPage();
    await client.post(`/api/v1/pages/${pageId}/content`, { content: 'A' });

    const appResponse = await client.post('/api/v1/apps', {
      workspaceId: SEED.workspace.id,
      label: 'E2E Append/Prepend Read Only App',
      permission: 'read',
      scopeType: 'workspace',
      attributionMode: 'creator',
    });
    const app = await getData<AppApi>(appResponse);
    const keyResponse = await client.post(`/api/v1/apps/${app.id}/keys`, {});
    const key = await getData<ApiKeyApi>(keyResponse);
    const bearerClient = createBearerClient(getBaseUrl(), key.secret);

    const appendResponse = await bearerClient.post(`/api/v1/pages/${pageId}/append`, { content: 'B' });
    expect(appendResponse.status).toBe(403);

    const prependResponse = await bearerClient.post(`/api/v1/pages/${pageId}/prepend`, { content: 'Z' });
    expect(prependResponse.status).toBe(403);

    const getResponse = await client.get(`/api/v1/pages/${pageId}/content`);
    const getResult = await getData<ContentResponse>(getResponse);
    expect(getResult.content).toBe('A');
  });

  test('no auth returns 401 for append and prepend', async () => {
    const pageId = await createPage();
    const anonymousClient = createAnonymousClient(getBaseUrl());

    const appendResponse = await anonymousClient.post(`/api/v1/pages/${pageId}/append`, { content: 'B' });
    expect(appendResponse.status).toBe(401);

    const prependResponse = await anonymousClient.post(`/api/v1/pages/${pageId}/prepend`, { content: 'Z' });
    expect(prependResponse.status).toBe(401);
  });

  test('a non-existent page id returns 404 for append and prepend', async () => {
    const client = await getOwner();

    const appendResponse = await client.post('/api/v1/pages/e2e-nonexistent-page-id/append', { content: 'B' });
    expect(appendResponse.status).toBe(404);

    const prependResponse = await client.post('/api/v1/pages/e2e-nonexistent-page-id/prepend', { content: 'Z' });
    expect(prependResponse.status).toBe(404);
  });

  test('an invalid body returns 400 for append and prepend', async () => {
    const client = await getOwner();
    const pageId = await createPage();

    const missingContentAppend = await client.post(`/api/v1/pages/${pageId}/append`, {});
    expect(missingContentAppend.status).toBe(400);

    const wrongTypeAppend = await client.post(`/api/v1/pages/${pageId}/append`, { content: 12_345 });
    expect(wrongTypeAppend.status).toBe(400);

    const missingContentPrepend = await client.post(`/api/v1/pages/${pageId}/prepend`, {});
    expect(missingContentPrepend.status).toBe(400);

    const wrongTypePrepend = await client.post(`/api/v1/pages/${pageId}/prepend`, { content: 12_345 });
    expect(wrongTypePrepend.status).toBe(400);
  });

  test('lastUpdated is bumped by append', async () => {
    const client = await getOwner();
    const pageId = await createPage();

    const before = await getData<PageDetails>(await client.get(`/api/v1/pages/${pageId}`));
    const beforeTime = new Date(before.page.lastUpdated).getTime();

    await client.post(`/api/v1/pages/${pageId}/append`, { content: 'B' });

    await expect
      .poll(async () => {
        const after = await getData<PageDetails>(await client.get(`/api/v1/pages/${pageId}`));
        return new Date(after.page.lastUpdated).getTime();
      })
      .toBeGreaterThan(beforeTime);
  });

  test('an empty content string is an accepted no-op that still bumps lastUpdated', async () => {
    const client = await getOwner();
    const pageId = await createPage();
    await client.post(`/api/v1/pages/${pageId}/content`, { content: 'A' });

    const before = await getData<PageDetails>(await client.get(`/api/v1/pages/${pageId}`));
    const beforeTime = new Date(before.page.lastUpdated).getTime();

    const response = await client.post(`/api/v1/pages/${pageId}/append`, { content: '' });
    expect(response.ok).toBe(true);
    const result = await getData<ContentResponse>(response);
    expect(result.content).toBe('A');

    await expect
      .poll(async () => {
        const after = await getData<PageDetails>(await client.get(`/api/v1/pages/${pageId}`));
        return new Date(after.page.lastUpdated).getTime();
      })
      .toBeGreaterThan(beforeTime);
  });
});
