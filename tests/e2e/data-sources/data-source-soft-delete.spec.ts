import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

async function getData<T>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data as T;
}

async function createWorkspace(request: APIRequestContext, name: string) {
  const response = await request.post('/api/v1/workspaces', { data: { name } });
  expect(response.ok()).toBeTruthy();
  return getData<{ id: string }>(response);
}

async function createPage(
  request: APIRequestContext,
  data: { name: string; workspaceId?: string; parentId?: string | null }
) {
  const response = await request.post('/api/v1/pages', {
    data: {
      emoji: null,
      parentId: data.parentId ?? null,
      ...data,
    },
  });
  expect(response.ok()).toBeTruthy();
  return getData<{ id: string }>(response);
}

async function createDataSource(request: APIRequestContext, workspaceId: string, name: string) {
  const response = await request.post('/api/v1/data-sources', {
    data: {
      workspaceId,
      name,
      columns: [{ name: 'Title', type: 'string' }],
    },
  });
  expect(response.ok()).toBeTruthy();
  return getData<{ id: string }>(response);
}

async function createView(
  request: APIRequestContext,
  data: { name: string; workspaceId: string; dataSourceId: string; pageId: string }
) {
  const response = await request.post('/api/v1/views', { data });
  expect(response.ok()).toBeTruthy();
  return getData<{ id: string }>(response);
}

test.describe('data source soft delete API', () => {
  test('deleting a data source hides its views and restore brings them back', async ({ request }) => {
    const unique = Date.now();
    const workspace = await createWorkspace(request, `THOTH-033 Data Source Restore ${unique}`);
    const hostPage = await createPage(request, { name: `Host ${unique}`, workspaceId: workspace.id });
    const dataSource = await createDataSource(request, workspace.id, `Data Source ${unique}`);
    const view = await createView(request, {
      name: `View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: hostPage.id,
    });

    const deleteDataSourceResponse = await request.delete(`/api/v1/data-sources/${dataSource.id}`);
    expect(deleteDataSourceResponse.status()).toBe(204);

    const treeAfterDelete = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const deletedTree = await getData<{ branches: Array<{ page: { id: string }; views?: Array<{ id: string }> }> }>(
      treeAfterDelete
    );
    const deletedBranch = deletedTree.branches.find((branch) => branch.page.id === hostPage.id);
    expect(deletedBranch?.views ?? []).toHaveLength(0);

    const detailsAfterDelete = await request.get(`/api/v1/pages/${hostPage.id}`);
    const deletedPage = await getData<{ views?: Array<{ id: string }> }>(detailsAfterDelete);
    expect(deletedPage.views ?? []).toHaveLength(0);
    const deletedViewResponse = await request.get(`/api/v1/views/${view.id}`);
    expect(deletedViewResponse.status()).toBe(404);

    const restoreResponse = await request.post(`/api/v1/data-sources/${dataSource.id}/restore`);
    expect(restoreResponse.ok()).toBeTruthy();

    const treeAfterRestore = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const restoredTree = await getData<{ branches: Array<{ page: { id: string }; views?: Array<{ id: string }> }> }>(
      treeAfterRestore
    );
    const restoredBranch = restoredTree.branches.find((branch) => branch.page.id === hostPage.id);
    expect(restoredBranch?.views?.some((item) => item.id === view.id)).toBeTruthy();
  });

  test('a view can be independently soft-deleted and restored', async ({ request }) => {
    const unique = Date.now();
    const workspace = await createWorkspace(request, `THOTH-033 View Restore ${unique}`);
    const hostPage = await createPage(request, { name: `View Host ${unique}`, workspaceId: workspace.id });
    const dataSource = await createDataSource(request, workspace.id, `View Source ${unique}`);
    const view = await createView(request, {
      name: `Standalone View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: hostPage.id,
    });

    const deleteViewResponse = await request.delete(`/api/v1/views/${view.id}`);
    expect(deleteViewResponse.status()).toBe(204);
    const getDeletedViewResponse = await request.get(`/api/v1/views/${view.id}`);
    expect(getDeletedViewResponse.status()).toBe(404);

    const detailsAfterDelete = await request.get(`/api/v1/pages/${hostPage.id}`);
    const deletedPage = await getData<{ views?: Array<{ id: string }> }>(detailsAfterDelete);
    expect(deletedPage.views?.some((item) => item.id === view.id)).toBeFalsy();

    const restoreResponse = await request.post(`/api/v1/views/${view.id}/restore`);
    expect(restoreResponse.ok()).toBeTruthy();

    const detailsAfterRestore = await request.get(`/api/v1/pages/${hostPage.id}`);
    const restoredPage = await getData<{ views?: Array<{ id: string }> }>(detailsAfterRestore);
    expect(restoredPage.views?.some((item) => item.id === view.id)).toBeTruthy();
  });
});
