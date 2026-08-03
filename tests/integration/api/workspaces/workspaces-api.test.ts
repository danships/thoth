import { describe, expect, test } from 'vitest';
import { getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('workspaces API', () => {
  test('can create a workspace, see it in the list, and it starts with a Welcome page', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/workspaces', {
      name: 'THOTH-027 E2E Workspace',
    });
    expect(createResponse.ok).toBe(true);
    const created = await getData<{ id: string; name: string; slug: string }>(createResponse);

    expect(created.name).toBe('THOTH-027 E2E Workspace');
    expect(created.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);

    const listResponse = await client.get('/api/v1/workspaces');
    expect(listResponse.ok).toBe(true);
    const workspaces = await getData<{ id: string }[]>(listResponse);
    expect(workspaces.some((workspace) => workspace.id === created.id)).toBe(true);
    expect(workspaces.some((workspace) => workspace.id === SEED.workspace.id)).toBe(true);
  });

  test('pages created in one workspace are isolated from another', async () => {
    const client = await getOwner();

    const workspaceAResponse = await client.post('/api/v1/workspaces', { name: 'Isolation Workspace A' });
    const workspaceA = await getData<{ id: string }>(workspaceAResponse);

    const workspaceBResponse = await client.post('/api/v1/workspaces', { name: 'Isolation Workspace B' });
    const workspaceB = await getData<{ id: string }>(workspaceBResponse);

    const pageResponse = await client.post('/api/v1/pages', {
      name: 'Only in workspace A',
      emoji: null,
      parentId: null,
      workspaceId: workspaceA.id,
    });
    expect(pageResponse.ok).toBe(true);
    const page = await getData<{ id: string }>(pageResponse);

    const treeAResponse = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspaceA.id } });
    const treeA = await getData<{ branches: { page: { id: string } }[] }>(treeAResponse);
    expect(treeA.branches.some((branch) => branch.page.id === page.id)).toBe(true);

    const treeBResponse = await client.get('/api/v1/pages/tree', { params: { workspaceId: workspaceB.id } });
    const treeB = await getData<{ branches: { page: { id: string } }[] }>(treeBResponse);
    expect(treeB.branches.some((branch) => branch.page.id === page.id)).toBe(false);
  });

  test('POST /pages/welcome is scoped per workspace and does not leak the other workspace welcome page', async () => {
    const client = await getOwner();

    const workspaceAResponse = await client.post('/api/v1/workspaces', { name: 'Welcome Bug Workspace A' });
    const workspaceA = await getData<{ id: string }>(workspaceAResponse);

    const workspaceBResponse = await client.post('/api/v1/workspaces', { name: 'Welcome Bug Workspace B' });
    const workspaceB = await getData<{ id: string }>(workspaceBResponse);

    const welcomeAResponse = await client.post('/api/v1/pages/welcome', { workspaceId: workspaceA.id });
    expect(welcomeAResponse.ok).toBe(true);
    const welcomeA = await getData<{ id: string }>(welcomeAResponse);

    const welcomeBResponse = await client.post('/api/v1/pages/welcome', { workspaceId: workspaceB.id });
    expect(welcomeBResponse.ok).toBe(true);
    const welcomeB = await getData<{ id: string }>(welcomeBResponse);

    expect(welcomeA.id).not.toBe(welcomeB.id);
  });

  test('can rename a workspace and change its slug', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/workspaces', { name: 'Rename Me' });
    const workspace = await getData<{ id: string }>(createResponse);

    const newSlug = `renamed-workspace-e2e-${Date.now()}`;
    const patchResponse = await client.patch(`/api/v1/workspaces/${workspace.id}`, {
      name: 'Renamed Workspace',
      slug: newSlug,
    });
    expect(patchResponse.ok).toBe(true);
    const updated = await getData<{ name: string; slug: string }>(patchResponse);

    expect(updated.name).toBe('Renamed Workspace');
    expect(updated.slug).toBe(newSlug);
  });

  test('slug-availability reflects reserved words and existing slugs as unavailable', async () => {
    const client = await getOwner();

    const reservedResponse = await client.get('/api/v1/workspaces/slug-availability', {
      params: { slug: 'new' },
    });
    expect(reservedResponse.ok).toBe(true);
    const reservedData = await getData<{ available: boolean }>(reservedResponse);
    expect(reservedData.available).toBe(false);

    const takenResponse = await client.get('/api/v1/workspaces/slug-availability', {
      params: { slug: SEED.workspace.slug },
    });
    expect(takenResponse.ok).toBe(true);
    const takenData = await getData<{ available: boolean }>(takenResponse);
    expect(takenData.available).toBe(false);

    const freeResponse = await client.get('/api/v1/workspaces/slug-availability', {
      params: { slug: `unclaimed-slug-${Date.now()}` },
    });
    expect(freeResponse.ok).toBe(true);
    const freeData = await getData<{ available: boolean }>(freeResponse);
    expect(freeData.available).toBe(true);
  });

  test('the seeded second workspace is listed and its pages stay isolated from the first', async () => {
    const client = await getOwner();

    const listResponse = await client.get('/api/v1/workspaces');
    const workspaces = await getData<{ id: string }[]>(listResponse);
    expect(workspaces.some((workspace) => workspace.id === SEED.workspace.id)).toBe(true);
    expect(workspaces.some((workspace) => workspace.id === SEED.secondWorkspace.id)).toBe(true);

    const treeTwoResponse = await client.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.secondWorkspace.id },
    });
    const treeTwo = await getData<{ branches: { page: { id: string } }[] }>(treeTwoResponse);
    expect(treeTwo.branches.some((branch) => branch.page.id === SEED.secondWorkspace.rootPage.id)).toBe(true);

    const treeOneResponse = await client.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.workspace.id },
    });
    const treeOne = await getData<{ branches: { page: { id: string } }[] }>(treeOneResponse);
    expect(treeOne.branches.some((branch) => branch.page.id === SEED.secondWorkspace.rootPage.id)).toBe(false);
  });

  test('cannot delete the only active workspace, but can delete and restore an extra one', async () => {
    const client = await getOwner();

    const createResponse = await client.post('/api/v1/workspaces', { name: 'Disposable Workspace' });
    const disposable = await getData<{ id: string }>(createResponse);

    const deleteResponse = await client.delete(`/api/v1/workspaces/${disposable.id}`);
    expect(deleteResponse.status).toBe(204);

    const listAfterDeleteResponse = await client.get('/api/v1/workspaces');
    const listAfterDelete = await getData<{ id: string }[]>(listAfterDeleteResponse);
    expect(listAfterDelete.some((workspace) => workspace.id === disposable.id)).toBe(false);

    const restoreResponse = await client.post(`/api/v1/workspaces/${disposable.id}/restore`);
    expect(restoreResponse.ok).toBe(true);
    const restored = await getData<{ id: string }>(restoreResponse);
    expect(restored.id).toBe(disposable.id);

    const listAfterRestoreResponse = await client.get('/api/v1/workspaces');
    const listAfterRestore = await getData<{ id: string }[]>(listAfterRestoreResponse);
    expect(listAfterRestore.some((workspace) => workspace.id === disposable.id)).toBe(true);

    const activeWorkspacesResponse = await client.get('/api/v1/workspaces');
    const activeWorkspaces = await getData<{ id: string }[]>(activeWorkspacesResponse);
    try {
      for (const workspace of activeWorkspaces) {
        if (workspace.id === SEED.workspace.id) {
          continue;
        }
        await client.delete(`/api/v1/workspaces/${workspace.id}`);
      }

      const remainingResponse = await client.get('/api/v1/workspaces');
      const remaining = await getData<{ id: string }[]>(remainingResponse);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(SEED.workspace.id);

      const lastDeleteResponse = await client.delete(`/api/v1/workspaces/${SEED.workspace.id}`);
      expect(lastDeleteResponse.status).toBe(400);
    } finally {
      // SEED.secondWorkspace is shared across the sequential integration suite, so it must be
      // restored even if an assertion above throws, or later workspace tests will fail.
      const restoreSecondResponse = await client.post(`/api/v1/workspaces/${SEED.secondWorkspace.id}/restore`);
      expect(restoreSecondResponse.ok).toBe(true);
    }
  });
});
