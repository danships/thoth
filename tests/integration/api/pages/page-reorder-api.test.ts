import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient, getThirdUserClient, SEED } from '../../support/fixtures';

async function createPage(client: ApiClient, data: { name: string; workspaceId?: string; parentId?: string | null }) {
  const response = await client.post('/api/v1/pages', {
    emoji: null,
    parentId: data.parentId ?? null,
    ...data,
  });
  expect(response.ok).toBe(true);
  return getData<{ id: string; sortOrder: string | null }>(response);
}

async function getChildren(client: ApiClient, parentId: string) {
  const response = await client.get('/api/v1/pages', { params: { parentId } });
  expect(response.ok).toBe(true);
  const data = await getData<Array<{ page: { id: string; sortOrder: string | null } }>>(response);
  return data.map((entry) => entry.page);
}

describe('page reorder API', () => {
  test('new child pages are appended in creation order, and a reorder moves a page within its sibling group', async () => {
    const owner = await getOwner();
    const unique = Date.now();
    const parent = await createPage(owner, { name: `Reorder Parent ${unique}`, workspaceId: SEED.workspace.id });

    const first = await createPage(owner, { name: 'First', parentId: parent.id });
    const second = await createPage(owner, { name: 'Second', parentId: parent.id });
    const third = await createPage(owner, { name: 'Third', parentId: parent.id });

    // New parented pages always land at the end of their sibling group, in ascending sortOrder.
    expect(first.sortOrder).not.toBeNull();
    expect(second.sortOrder).not.toBeNull();
    expect(third.sortOrder).not.toBeNull();
    expect((first.sortOrder ?? '') < (second.sortOrder ?? '')).toBe(true);
    expect((second.sortOrder ?? '') < (third.sortOrder ?? '')).toBe(true);

    const initialOrder = await getChildren(owner, parent.id);
    expect(initialOrder.map((page) => page.id)).toEqual([first.id, second.id, third.id]);

    // Move `third` to the very front (before `first`, no `afterId` neighbour since it's now the
    // first page).
    const reorderResponse = await owner.post(`/api/v1/pages/${third.id}/reorder`, {
      beforeId: null,
      afterId: first.id,
    });
    expect(reorderResponse.ok).toBe(true);
    const reordered = await getData<{ id: string; sortOrder: string | null }>(reorderResponse);
    expect(reordered.id).toBe(third.id);

    const afterReorder = await getChildren(owner, parent.id);
    expect(afterReorder.map((page) => page.id)).toEqual([third.id, first.id, second.id]);
  });

  test('rejects an anchor from a different sibling group', async () => {
    const owner = await getOwner();
    const unique = Date.now();
    const parentA = await createPage(owner, { name: `Reorder Group A ${unique}`, workspaceId: SEED.workspace.id });
    const parentB = await createPage(owner, { name: `Reorder Group B ${unique}`, workspaceId: SEED.workspace.id });

    const pageInA = await createPage(owner, { name: 'Page in A', parentId: parentA.id });
    const otherPageInA = await createPage(owner, { name: 'Other page in A', parentId: parentA.id });
    const pageInB = await createPage(owner, { name: 'Page in B', parentId: parentB.id });

    const response = await owner.post(`/api/v1/pages/${pageInA.id}/reorder`, {
      beforeId: pageInB.id,
      afterId: null,
    });
    expect(response.status).toBe(400);

    // Sanity: a same-group anchor still works for the same page.
    const validResponse = await owner.post(`/api/v1/pages/${pageInA.id}/reorder`, {
      beforeId: otherPageInA.id,
      afterId: null,
    });
    expect(validResponse.ok).toBe(true);
  });

  test('rejects reordering a root-level page', async () => {
    const owner = await getOwner();
    const unique = Date.now();
    const rootPage = await createPage(owner, { name: `Reorder Root ${unique}`, workspaceId: SEED.workspace.id });

    const response = await owner.post(`/api/v1/pages/${rootPage.id}/reorder`, { beforeId: null, afterId: null });
    expect(response.status).toBe(400);
  });

  test('a read-only member cannot reorder a shared page', async () => {
    const owner = await getOwner();
    const unique = Date.now();
    const parent = await createPage(owner, {
      name: `Reorder ReadOnly Parent ${unique}`,
      workspaceId: SEED.workspace.id,
    });
    const first = await createPage(owner, { name: 'RO First', parentId: parent.id });
    await createPage(owner, { name: 'RO Second', parentId: parent.id });

    const readOnlyClient = await getThirdUserClient(getBaseUrl());
    const response = await readOnlyClient.post(`/api/v1/pages/${first.id}/reorder`, {
      beforeId: null,
      afterId: null,
    });
    expect(response.status).toBe(403);
  });
});

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}
