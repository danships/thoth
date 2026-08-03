import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

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

describe('data source soft delete API', () => {
  test('deleting a data source hides its views and restore brings them back', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-033 Data Source Restore ${unique}`);
    const hostPage = await createPage(client, { name: `Host ${unique}`, workspaceId: workspace.id });
    const dataSource = await createDataSource(client, workspace.id, `Data Source ${unique}`);
    const view = await createView(client, {
      name: `View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: hostPage.id,
    });

    const deleteDataSourceResponse = await client.delete(`/api/v1/data-sources/${dataSource.id}`);
    expect(deleteDataSourceResponse.status).toBe(204);

    const treeAfterDelete = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const deletedTree = await getData<{ branches: Array<{ page: { id: string }; views?: Array<{ id: string }> }> }>(
      treeAfterDelete
    );
    const deletedBranch = deletedTree.branches.find((branch) => branch.page.id === hostPage.id);
    expect(deletedBranch?.views ?? []).toHaveLength(0);

    const detailsAfterDelete = await client.get(`/api/v1/pages/${hostPage.id}`);
    const deletedPage = await getData<{ views?: Array<{ id: string }> }>(detailsAfterDelete);
    expect(deletedPage.views ?? []).toHaveLength(0);
    const deletedViewResponse = await client.get(`/api/v1/views/${view.id}`);
    expect(deletedViewResponse.status).toBe(404);

    const restoreResponse = await client.post(`/api/v1/data-sources/${dataSource.id}/restore`);
    expect(restoreResponse.ok).toBe(true);

    const treeAfterRestore = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const restoredTree = await getData<{ branches: Array<{ page: { id: string }; views?: Array<{ id: string }> }> }>(
      treeAfterRestore
    );
    const restoredBranch = restoredTree.branches.find((branch) => branch.page.id === hostPage.id);
    expect(restoredBranch?.views?.some((item) => item.id === view.id)).toBe(true);
  });

  test('a view can be independently soft-deleted and restored', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-033 View Restore ${unique}`);
    const hostPage = await createPage(client, { name: `View Host ${unique}`, workspaceId: workspace.id });
    const dataSource = await createDataSource(client, workspace.id, `View Source ${unique}`);
    const view = await createView(client, {
      name: `Standalone View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: hostPage.id,
    });

    const deleteViewResponse = await client.delete(`/api/v1/views/${view.id}`);
    expect(deleteViewResponse.status).toBe(204);
    const getDeletedViewResponse = await client.get(`/api/v1/views/${view.id}`);
    expect(getDeletedViewResponse.status).toBe(404);

    const detailsAfterDelete = await client.get(`/api/v1/pages/${hostPage.id}`);
    const deletedPage = await getData<{ views?: Array<{ id: string }> }>(detailsAfterDelete);
    expect(deletedPage.views?.some((item) => item.id === view.id)).toBeFalsy();

    const restoreResponse = await client.post(`/api/v1/views/${view.id}/restore`);
    expect(restoreResponse.ok).toBe(true);

    const detailsAfterRestore = await client.get(`/api/v1/pages/${hostPage.id}`);
    const restoredPage = await getData<{ views?: Array<{ id: string }> }>(detailsAfterRestore);
    expect(restoredPage.views?.some((item) => item.id === view.id)).toBe(true);
  });
});
