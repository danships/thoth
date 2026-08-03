import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function createWorkspace(client: ApiClient, name: string) {
  const response = await client.post('/api/v1/workspaces', { name });
  expect(response.ok).toBe(true);
  return getData<{ id: string; slug: string }>(response);
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

describe('page soft delete API', () => {
  test('deleting a page cascades to children and linked views, then restore brings them back', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-033 Page Restore ${unique}`);
    const parent = await createPage(client, { name: `Parent ${unique}`, workspaceId: workspace.id });
    const child = await createPage(client, { name: `Child ${unique}`, parentId: parent.id });
    const dataSource = await createDataSource(client, workspace.id, `Data Source ${unique}`);
    const view = await createView(client, {
      name: `View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: parent.id,
    });

    const deleteResponse = await client.delete(`/api/v1/pages/${parent.id}`);
    expect(deleteResponse.status).toBe(204);

    const treeAfterDelete = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const deletedTree = await getData<{ branches: Array<{ page: { id: string } }> }>(treeAfterDelete);
    expect(deletedTree.branches.some((branch) => branch.page.id === parent.id)).toBe(false);

    const deletedListResponse = await client.get('/api/v1/pages/deleted', { params: { workspaceId: workspace.id } });
    expect(deletedListResponse.ok).toBe(true);
    const deletedItems = await getData<Array<{ id: string; type: string }>>(deletedListResponse);
    expect(deletedItems).toContainEqual(expect.objectContaining({ id: parent.id, type: 'page' }));
    expect(deletedItems.some((item) => item.id === child.id)).toBe(false);

    const deletedParentResponse = await client.get(`/api/v1/pages/${parent.id}`);
    expect(deletedParentResponse.status).toBe(404);
    const deletedChildResponse = await client.get(`/api/v1/pages/${child.id}`);
    expect(deletedChildResponse.status).toBe(404);
    const deletedViewResponse = await client.get(`/api/v1/views/${view.id}`);
    expect(deletedViewResponse.status).toBe(404);

    const restoreResponse = await client.post(`/api/v1/pages/${parent.id}/restore`);
    expect(restoreResponse.ok).toBe(true);

    const treeAfterRestore = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const restoredTree = await getData<{
      branches: Array<{
        page: { id: string };
        children: Array<{ page: { id: string } }>;
        views?: Array<{ id: string }>;
      }>;
    }>(treeAfterRestore);
    const restoredBranch = restoredTree.branches.find((branch) => branch.page.id === parent.id);
    expect(restoredBranch).toBeTruthy();
    expect(restoredBranch?.children.some((branch) => branch.page.id === child.id)).toBe(true);
    expect(restoredBranch?.views?.some((linkedView) => linkedView.id === view.id)).toBe(true);

    const restoredDetails = await client.get(`/api/v1/pages/${parent.id}`);
    expect(restoredDetails.ok).toBe(true);
    const restoredPage = await getData<{ views?: Array<{ id: string }> }>(restoredDetails);
    expect(restoredPage.views?.some((linkedView) => linkedView.id === view.id)).toBe(true);
  });

  test('an independently deleted child is not restored with its parent', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-033 Child Root ${unique}`);
    const parent = await createPage(client, { name: `Parent ${unique}`, workspaceId: workspace.id });
    const child = await createPage(client, { name: `Child ${unique}`, parentId: parent.id });

    const deleteChildResponse = await client.delete(`/api/v1/pages/${child.id}`);
    expect(deleteChildResponse.status).toBe(204);
    const deleteParentResponse = await client.delete(`/api/v1/pages/${parent.id}`);
    expect(deleteParentResponse.status).toBe(204);

    const restoreManyResponse = await client.post('/api/v1/pages/deleted/restore', { ids: [parent.id] });
    expect(restoreManyResponse.ok).toBe(true);
    const restoreManyResult = await getData<{ restored: string[]; failed: Array<{ id: string }> }>(restoreManyResponse);
    expect(restoreManyResult.restored).toContain(parent.id);
    expect(restoreManyResult.failed).toHaveLength(0);

    const parentTreeResponse = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const tree = await getData<{
      branches: Array<{ page: { id: string }; children: Array<{ page: { id: string } }> }>;
    }>(parentTreeResponse);
    const parentBranch = tree.branches.find((branch) => branch.page.id === parent.id);
    expect(parentBranch).toBeTruthy();
    expect(parentBranch?.children.some((branch) => branch.page.id === child.id)).toBe(false);
    const deletedChildDetailsResponse = await client.get(`/api/v1/pages/${child.id}`);
    expect(deletedChildDetailsResponse.status).toBe(404);

    const deleteManyResponse = await client.post('/api/v1/pages/deleted/delete', { ids: [child.id] });
    expect(deleteManyResponse.ok).toBe(true);
    const deleteManyResult = await getData<{ deleted: string[]; failed: Array<{ id: string }> }>(deleteManyResponse);
    expect(deleteManyResult.deleted).toContain(child.id);
  });

  test('a soft-deleted page can be permanently deleted', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-033 Permanent Delete ${unique}`);
    const page = await createPage(client, { name: `Permanent ${unique}`, workspaceId: workspace.id });

    const softDeleteResponse = await client.delete(`/api/v1/pages/${page.id}`);
    expect(softDeleteResponse.status).toBe(204);
    const permanentDeleteResponse = await client.delete(`/api/v1/pages/${page.id}/permanent`);
    expect(permanentDeleteResponse.status).toBe(204);

    const deletedListResponse = await client.get('/api/v1/pages/deleted', { params: { workspaceId: workspace.id } });
    const deletedItems = await getData<Array<{ id: string }>>(deletedListResponse);
    expect(deletedItems.some((item) => item.id === page.id)).toBe(false);
    const restoreDeletedPageResponse = await client.post(`/api/v1/pages/${page.id}/restore`);
    expect(restoreDeletedPageResponse.status).toBe(404);
  });
});
