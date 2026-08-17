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

type PageDetails = { id: string; isPrivate: boolean; privateRootId: string | null };

describe('page privacy API (THOTH-077)', () => {
  test('marking a page private cascades to descendants and excludes them from Recent, but not Favorites or the tree', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-077 Private ${unique}`);
    const parent = await createPage(client, { name: `Parent ${unique}`, workspaceId: workspace.id });
    const child = await createPage(client, { name: `Child ${unique}`, parentId: parent.id });

    // Register access + star both pages so they'd normally show up in Recent/Favorites.
    await client.post(`/api/v1/pages/${parent.id}/access`);
    await client.post(`/api/v1/pages/${child.id}/access`);
    await client.put(`/api/v1/pages/${parent.id}/favorite`, { starred: true });

    const patchResponse = await client.patch(`/api/v1/pages/${parent.id}`, { isPrivate: true });
    expect(patchResponse.ok).toBe(true);
    const patched = await getData<PageDetails & { affectedPageCount?: number }>(patchResponse);
    expect(patched.isPrivate).toBe(true);
    expect(patched.privateRootId).toBe(parent.id);
    expect(patched.affectedPageCount).toBe(2);

    const childDetailsResponse = await client.get(`/api/v1/pages/${child.id}`);
    const childDetails = await getData<{ page: PageDetails }>(childDetailsResponse);
    expect(childDetails.page.isPrivate).toBe(true);
    expect(childDetails.page.privateRootId).toBe(parent.id);

    // Excluded from Recent.
    const recentResponse = await client.get('/api/v1/pages', { params: { recent: 'true', workspaceId: workspace.id } });
    const recentItems = await getData<Array<{ page: { id: string } }>>(recentResponse);
    expect(recentItems.some((item) => item.page.id === parent.id)).toBe(false);
    expect(recentItems.some((item) => item.page.id === child.id)).toBe(false);

    // Still visible in Favorites.
    const favoritedResponse = await client.get('/api/v1/pages', {
      params: { favorited: 'true', workspaceId: workspace.id },
    });
    const favoritedItems = await getData<Array<{ page: { id: string; isPrivate: boolean } }>>(favoritedResponse);
    const favoritedParent = favoritedItems.find((item) => item.page.id === parent.id);
    expect(favoritedParent).toBeTruthy();
    expect(favoritedParent?.page.isPrivate).toBe(true);

    // Still visible in the plain tree.
    const treeResponse = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspace.id } });
    const tree = await getData<{ branches: Array<{ page: { id: string } }> }>(treeResponse);
    expect(tree.branches.some((branch) => branch.page.id === parent.id)).toBe(true);

    // Un-marking the root clears the cascade.
    const unmarkResponse = await client.patch(`/api/v1/pages/${parent.id}`, { isPrivate: false });
    expect(unmarkResponse.ok).toBe(true);
    const unmarked = await getData<PageDetails & { affectedPageCount?: number }>(unmarkResponse);
    expect(unmarked.isPrivate).toBe(false);
    expect(unmarked.affectedPageCount).toBe(2);

    const childAfterUnmarkResponse = await client.get(`/api/v1/pages/${child.id}`);
    const childAfterUnmark = await getData<{ page: PageDetails }>(childAfterUnmarkResponse);
    expect(childAfterUnmark.page.isPrivate).toBe(false);
    expect(childAfterUnmark.page.privateRootId).toBeNull();
  });

  test('un-marking a non-root cascaded descendant directly is rejected with 400', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-077 Reject ${unique}`);
    const parent = await createPage(client, { name: `Parent ${unique}`, workspaceId: workspace.id });
    const child = await createPage(client, { name: `Child ${unique}`, parentId: parent.id });

    const markResponse = await client.patch(`/api/v1/pages/${parent.id}`, { isPrivate: true });
    expect(markResponse.ok).toBe(true);

    const rejectedResponse = await client.patch(`/api/v1/pages/${child.id}`, { isPrivate: false });
    expect(rejectedResponse.status).toBe(400);

    const childDetailsResponse = await client.get(`/api/v1/pages/${child.id}`);
    const childDetails = await getData<{ page: PageDetails }>(childDetailsResponse);
    expect(childDetails.page.isPrivate).toBe(true);
    expect(childDetails.page.privateRootId).toBe(parent.id);
  });

  test('PATCH with isPrivate equal to the current state is a no-op (affectedPageCount: 0)', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-077 Noop ${unique}`);
    const page = await createPage(client, { name: `Page ${unique}`, workspaceId: workspace.id });

    const response = await client.patch(`/api/v1/pages/${page.id}`, { isPrivate: false });
    expect(response.ok).toBe(true);
    const result = await getData<PageDetails & { affectedPageCount?: number }>(response);
    expect(result.isPrivate).toBe(false);
    expect(result.affectedPageCount).toBeUndefined();
  });

  test('omitting isPrivate from the body leaves privacy state untouched', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-077 Untouched ${unique}`);
    const page = await createPage(client, { name: `Page ${unique}`, workspaceId: workspace.id });

    const markResponse = await client.patch(`/api/v1/pages/${page.id}`, { isPrivate: true });
    expect(markResponse.ok).toBe(true);

    const response = await client.patch(`/api/v1/pages/${page.id}`, { name: `Renamed ${unique}` });
    expect(response.ok).toBe(true);
    const result = await getData<PageDetails & { name: string }>(response);
    expect(result.name).toBe(`Renamed ${unique}`);
    expect(result.isPrivate).toBe(true);
  });

  test('restoring a soft-deleted private page keeps its privacy state', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-077 Restore ${unique}`);
    const page = await createPage(client, { name: `Page ${unique}`, workspaceId: workspace.id });

    await client.patch(`/api/v1/pages/${page.id}`, { isPrivate: true });

    const deleteResponse = await client.delete(`/api/v1/pages/${page.id}`);
    expect(deleteResponse.status).toBe(204);

    const restoreResponse = await client.post(`/api/v1/pages/${page.id}/restore`);
    expect(restoreResponse.ok).toBe(true);

    const detailsResponse = await client.get(`/api/v1/pages/${page.id}`);
    const details = await getData<{ page: PageDetails }>(detailsResponse);
    expect(details.page.isPrivate).toBe(true);
    expect(details.page.privateRootId).toBe(page.id);
  });
});
