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
  return getData<{ id: string; slug: string }>(response);
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

test.describe('page soft delete API', () => {
  test('deleting a page cascades to children and linked views, then restore brings them back', async ({ request }) => {
    const unique = Date.now();
    const workspace = await createWorkspace(request, `THOTH-033 Page Restore ${unique}`);
    const parent = await createPage(request, { name: `Parent ${unique}`, workspaceId: workspace.id });
    const child = await createPage(request, { name: `Child ${unique}`, parentId: parent.id });
    const dataSource = await createDataSource(request, workspace.id, `Data Source ${unique}`);
    const view = await createView(request, {
      name: `View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: parent.id,
    });

    const deleteResponse = await request.delete(`/api/v1/pages/${parent.id}`);
    expect(deleteResponse.status()).toBe(204);

    const treeAfterDelete = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const deletedTree = await getData<{ branches: Array<{ page: { id: string } }> }>(treeAfterDelete);
    expect(deletedTree.branches.some((branch) => branch.page.id === parent.id)).toBeFalsy();

    const deletedListResponse = await request.get('/api/v1/pages/deleted', { params: { workspaceId: workspace.id } });
    expect(deletedListResponse.ok()).toBeTruthy();
    const deletedItems = await getData<Array<{ id: string; type: string }>>(deletedListResponse);
    expect(deletedItems).toContainEqual(expect.objectContaining({ id: parent.id, type: 'page' }));
    expect(deletedItems.some((item) => item.id === child.id)).toBeFalsy();

    const deletedParentResponse = await request.get(`/api/v1/pages/${parent.id}`);
    expect(deletedParentResponse.status()).toBe(404);
    const deletedChildResponse = await request.get(`/api/v1/pages/${child.id}`);
    expect(deletedChildResponse.status()).toBe(404);
    const deletedViewResponse = await request.get(`/api/v1/views/${view.id}`);
    expect(deletedViewResponse.status()).toBe(404);

    const restoreResponse = await request.post(`/api/v1/pages/${parent.id}/restore`);
    expect(restoreResponse.ok()).toBeTruthy();

    const treeAfterRestore = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const restoredTree = await getData<{
      branches: Array<{
        page: { id: string };
        children: Array<{ page: { id: string } }>;
        views?: Array<{ id: string }>;
      }>;
    }>(treeAfterRestore);
    const restoredBranch = restoredTree.branches.find((branch) => branch.page.id === parent.id);
    expect(restoredBranch).toBeTruthy();
    expect(restoredBranch?.children.some((branch) => branch.page.id === child.id)).toBeTruthy();
    expect(restoredBranch?.views?.some((linkedView) => linkedView.id === view.id)).toBeTruthy();

    const restoredDetails = await request.get(`/api/v1/pages/${parent.id}`);
    expect(restoredDetails.ok()).toBeTruthy();
    const restoredPage = await getData<{ views?: Array<{ id: string }> }>(restoredDetails);
    expect(restoredPage.views?.some((linkedView) => linkedView.id === view.id)).toBeTruthy();
  });

  test('an independently deleted child is not restored with its parent', async ({ request }) => {
    const unique = Date.now();
    const workspace = await createWorkspace(request, `THOTH-033 Child Root ${unique}`);
    const parent = await createPage(request, { name: `Parent ${unique}`, workspaceId: workspace.id });
    const child = await createPage(request, { name: `Child ${unique}`, parentId: parent.id });

    const deleteChildResponse = await request.delete(`/api/v1/pages/${child.id}`);
    expect(deleteChildResponse.status()).toBe(204);
    const deleteParentResponse = await request.delete(`/api/v1/pages/${parent.id}`);
    expect(deleteParentResponse.status()).toBe(204);

    const restoreManyResponse = await request.post('/api/v1/pages/deleted/restore', {
      data: { ids: [parent.id] },
    });
    expect(restoreManyResponse.ok()).toBeTruthy();
    const restoreManyResult = await getData<{ restored: string[]; failed: Array<{ id: string }> }>(restoreManyResponse);
    expect(restoreManyResult.restored).toContain(parent.id);
    expect(restoreManyResult.failed).toHaveLength(0);

    const parentTreeResponse = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const tree = await getData<{
      branches: Array<{ page: { id: string }; children: Array<{ page: { id: string } }> }>;
    }>(parentTreeResponse);
    const parentBranch = tree.branches.find((branch) => branch.page.id === parent.id);
    expect(parentBranch).toBeTruthy();
    expect(parentBranch?.children.some((branch) => branch.page.id === child.id)).toBeFalsy();
    const deletedChildDetailsResponse = await request.get(`/api/v1/pages/${child.id}`);
    expect(deletedChildDetailsResponse.status()).toBe(404);

    const deleteManyResponse = await request.post('/api/v1/pages/deleted/delete', {
      data: { ids: [child.id] },
    });
    expect(deleteManyResponse.ok()).toBeTruthy();
    const deleteManyResult = await getData<{ deleted: string[]; failed: Array<{ id: string }> }>(deleteManyResponse);
    expect(deleteManyResult.deleted).toContain(child.id);
  });

  test('a soft-deleted page can be permanently deleted', async ({ request }) => {
    const unique = Date.now();
    const workspace = await createWorkspace(request, `THOTH-033 Permanent Delete ${unique}`);
    const page = await createPage(request, { name: `Permanent ${unique}`, workspaceId: workspace.id });

    const softDeleteResponse = await request.delete(`/api/v1/pages/${page.id}`);
    expect(softDeleteResponse.status()).toBe(204);
    const permanentDeleteResponse = await request.delete(`/api/v1/pages/${page.id}/permanent`);
    expect(permanentDeleteResponse.status()).toBe(204);

    const deletedListResponse = await request.get('/api/v1/pages/deleted', { params: { workspaceId: workspace.id } });
    const deletedItems = await getData<Array<{ id: string }>>(deletedListResponse);
    expect(deletedItems.some((item) => item.id === page.id)).toBeFalsy();
    const restoreDeletedPageResponse = await request.post(`/api/v1/pages/${page.id}/restore`);
    expect(restoreDeletedPageResponse.status()).toBe(404);
  });
});
