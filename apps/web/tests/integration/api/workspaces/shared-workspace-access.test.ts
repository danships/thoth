import { describe, expect, test } from 'vitest';
import {
  getBaseUrl,
  getOwnerClient,
  getSecondUserClient,
  getThirdUserClient,
  SEED,
  type ApiClient,
} from '../../support/fixtures';

async function assertSharedPageReadable(client: ApiClient) {
  const response = await client.get(`/api/v1/pages/${SEED.sharedAccess.page.id}`);
  expect(response.ok).toBe(true);

  const body = await response.json<{ data: { page: { id: string; name: string } } }>();
  expect(body.data.page.id).toBe(SEED.sharedAccess.page.id);
  expect(body.data.page.name).toBe(SEED.sharedAccess.page.name);
}

async function assertSharedPageVisibleInTree(client: ApiClient) {
  let cursor: string | undefined;
  let found = false;

  for (let page = 0; page < 20 && !found; page += 1) {
    const response = await client.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.workspace.id, limit: '100', ...(cursor ? { cursor } : {}) },
    });
    expect(response.ok).toBe(true);

    const body = await response.json<{
      data: {
        branches: { page: { id: string } }[];
        pagination: { hasMore: boolean; nextCursor?: string };
      };
    }>();
    const ids = body.data.branches.map((branch) => branch.page.id);
    found = ids.includes(SEED.sharedAccess.page.id);

    if (!body.data.pagination.hasMore) {
      break;
    }
    cursor = body.data.pagination.nextCursor;
  }

  expect(found).toBe(true);
}

describe('shared workspace access (THOTH-042)', () => {
  test('owner can read and mutate the shared workspace page', async () => {
    const client = await getOwnerClient(getBaseUrl());

    await assertSharedPageReadable(client);
    await assertSharedPageVisibleInTree(client);

    const response = await client.patch(`/api/v1/pages/${SEED.sharedAccess.page.id}`, { emoji: '🔑' });
    expect(response.ok).toBe(true);
    const body = await response.json<{ data: { id: string } }>();
    expect(body.data.id).toBe(SEED.sharedAccess.page.id);
  });

  test('second user can read and mutate the shared workspace page', async () => {
    const client = await getSecondUserClient(getBaseUrl());

    await assertSharedPageReadable(client);
    await assertSharedPageVisibleInTree(client);

    const response = await client.patch(`/api/v1/pages/${SEED.sharedAccess.page.id}`, { emoji: '🔑' });
    expect(response.ok).toBe(true);
    const body = await response.json<{ data: { id: string } }>();
    expect(body.data.id).toBe(SEED.sharedAccess.page.id);
  });

  test('third user can read but not mutate the shared workspace page', async () => {
    const client = await getThirdUserClient(getBaseUrl());

    await assertSharedPageReadable(client);
    await assertSharedPageVisibleInTree(client);

    const response = await client.patch(`/api/v1/pages/${SEED.sharedAccess.page.id}`, { emoji: '🔑' });
    expect(response.status).toBe(403);
  });

  test('second and third users get 404 for workspaces they are not members of', async () => {
    for (const client of [await getSecondUserClient(getBaseUrl()), await getThirdUserClient(getBaseUrl())]) {
      const treeResponse = await client.get('/api/v1/pages/tree', {
        params: { workspaceId: SEED.secondWorkspace.id },
      });
      expect(treeResponse.status).toBe(404);

      const pageResponse = await client.get(`/api/v1/pages/${SEED.secondWorkspace.rootPage.id}`);
      expect(pageResponse.status).toBe(404);
    }
  });
});
