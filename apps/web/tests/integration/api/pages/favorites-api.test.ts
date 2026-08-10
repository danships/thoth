import { describe, expect, test } from 'vitest';
import { getBaseUrl, getOwnerClient, SEED } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('favorites API', () => {
  test('GET /pages?favorited=true satisfies the "one selector required" validation on its own', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages', {
      params: { favorited: 'true', workspaceId: SEED.workspace.id },
    });
    expect(response.ok).toBe(true);
  });

  test('GET /pages still requires at least one selector', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages');
    expect(response.status).toBe(400);
  });

  test('GET /pages with parentId still works alongside the relaxed favorited validation', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages', {
      params: { parentId: SEED.pages.root.id },
    });
    expect(response.ok).toBe(true);
    const body = await response.json<{ data: unknown }>();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /pages with dataSourceId still works alongside the relaxed favorited validation', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages', {
      params: { dataSourceId: SEED.dataSource.id },
    });
    expect(response.ok).toBe(true);
    const body = await response.json<{ data: unknown }>();
    expect(Array.isArray(body.data)).toBe(true);
  });
});
