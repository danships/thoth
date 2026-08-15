import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient, getSecondUserClient } from '../../support/fixtures';

async function createWorkspace(client: ApiClient, name: string) {
  const response = await client.post('/api/v1/workspaces', { name });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function createPage(client: ApiClient, data: { name: string; workspaceId?: string; parentId?: string | null }) {
  const response = await client.post('/api/v1/pages', {
    emoji: null,
    parentId: data.parentId ?? null,
    ...data,
  });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function createDataSource(client: ApiClient, workspaceId: string, name: string) {
  const response = await client.post('/api/v1/data-sources', {
    workspaceId,
    name,
    columns: [{ name: 'Title', type: 'string' }],
  });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function createView(
  client: ApiClient,
  data: { name: string; workspaceId: string; dataSourceId: string; pageId: string }
) {
  const response = await client.post('/api/v1/views', data);
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function setup(client: ApiClient, unique: number) {
  const workspace = await createWorkspace(client, `THOTH-073 Duplicate View ${unique}`);
  const hostPage = await createPage(client, { name: `Host ${unique}`, workspaceId: workspace.id });
  const dataSource = await createDataSource(client, workspace.id, `Data Source ${unique}`);
  const view = await createView(client, {
    name: `View ${unique}`,
    workspaceId: workspace.id,
    dataSourceId: dataSource.id,
    pageId: hostPage.id,
  });
  return { workspace, hostPage, dataSource, view };
}

describe('duplicate view API', () => {
  test('duplicates a view, appends it to the page, and names it "{name} (copy)"', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { hostPage, dataSource, view } = await setup(client, unique);

    // Give the source view some filters/sorts/columnLayout so the clone can be asserted to
    // have deep-cloned (not shared-referenced) copies of them.
    const viewDetailsResponse = await client.get(`/api/v1/views/${view.id}`);
    const viewDetails = await getData<{ lastUpdated: string }>(viewDetailsResponse);
    const patchResponse = await client.patch(`/api/v1/views/${view.id}`, {
      filters: [],
      sorts: [],
      columnLayout: [{ kind: 'name', visible: true }],
      expectedLastUpdated: viewDetails.lastUpdated,
    });
    expect(patchResponse.ok).toBe(true);
    const patchedView = await getData<{ lastUpdated: string; columnLayout: unknown[] }>(patchResponse);

    const duplicateResponse = await client.post(`/api/v1/views/${view.id}/duplicate`, { pageId: hostPage.id });
    expect(duplicateResponse.status).toBe(200);
    const duplicated = await getData<{
      id: string;
      name: string;
      dataSourceId: string;
      columnLayout: unknown[] | null;
    }>(duplicateResponse);

    expect(duplicated.id).not.toBe(view.id);
    expect(duplicated.name).toBe(`View ${unique} (copy)`);
    expect(duplicated.dataSourceId).toBe(dataSource.id);
    expect(duplicated.columnLayout).toEqual(patchedView.columnLayout);

    // Appended to the page's underlying `views` id list, alongside the original — visual tab
    // order in the GET /pages/:id response is whatever the repository query returns, so assert
    // set membership rather than the response array's order.
    const pageResponse = await client.get(`/api/v1/pages/${hostPage.id}`);
    const pageDetails = await getData<{ views?: Array<{ id: string }> }>(pageResponse);
    const viewIds = (pageDetails.views ?? []).map((entry) => entry.id);
    expect(viewIds).toHaveLength(2);
    expect(viewIds).toEqual(expect.arrayContaining([view.id, duplicated.id]));
  });

  test('duplicating a view whose name already ends in "(copy)" doubles the suffix', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { hostPage, view } = await setup(client, unique);

    const duplicateResponse = await client.post(`/api/v1/views/${view.id}/duplicate`, { pageId: hostPage.id });
    expect(duplicateResponse.status).toBe(200);
    const duplicated = await getData<{ id: string; name: string }>(duplicateResponse);
    expect(duplicated.name).toBe(`View ${unique} (copy)`);

    const secondDuplicateResponse = await client.post(`/api/v1/views/${duplicated.id}/duplicate`, {
      pageId: hostPage.id,
    });
    expect(secondDuplicateResponse.status).toBe(200);
    const secondDuplicate = await getData<{ name: string }>(secondDuplicateResponse);
    expect(secondDuplicate.name).toBe(`View ${unique} (copy) (copy)`);
  });

  test('returns 404 for a non-existent source view', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { hostPage } = await setup(client, unique);

    const response = await client.post('/api/v1/views/non-existent-view-id/duplicate', { pageId: hostPage.id });
    expect(response.status).toBe(404);
  });

  test('returns 404 when pageId does not resolve to an accessible page', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { view } = await setup(client, unique);

    const response = await client.post(`/api/v1/views/${view.id}/duplicate`, { pageId: 'non-existent-page-id' });
    expect(response.status).toBe(404);
  });

  test('returns 404 when the view is not linked to the given page', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { workspace, view } = await setup(client, unique);
    const otherPage = await createPage(client, { name: `Other Page ${unique}`, workspaceId: workspace.id });

    const response = await client.post(`/api/v1/views/${view.id}/duplicate`, { pageId: otherPage.id });
    expect(response.status).toBe(404);
  });

  test('returns 400 when pageId is missing from the request body', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { view } = await setup(client, unique);

    const response = await client.post(`/api/v1/views/${view.id}/duplicate`, {});
    expect(response.status).toBe(400);
  });

  test('a user outside the workspace gets 404, not 403, for both the view and the page', async () => {
    const ownerClient = await getOwnerClient(getBaseUrl());
    const unique = Date.now();
    const { hostPage, view } = await setup(ownerClient, unique);

    const outsiderClient = await getSecondUserClient(getBaseUrl());
    const response = await outsiderClient.post(`/api/v1/views/${view.id}/duplicate`, { pageId: hostPage.id });
    expect(response.status).toBe(404);
  });
});
