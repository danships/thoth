import type { APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data;
}

// Covers the new multi-workspace backend surface added in THOTH-027: creating additional
// workspaces, listing them, renaming/changing slugs, deleting (with the "last active
// workspace" guard) and restoring, plus data isolation between workspaces. This spec uses the
// API directly (via the `request` fixture, authenticated as the shared seed user through the
// default storage state) rather than the UI. The workspace switcher/creation menu and the
// per-workspace settings page (rename/slug/delete) are covered by the UI-driven specs in
// `tests/e2e/workspaces/workspace-menu.spec.ts` and `tests/e2e/workspaces/workspace-settings.spec.ts`;
// all workspace-scoped URLs are now prefixed with `/[workspace-slug]/...`.
test.describe('workspaces API', () => {
  test('can create a workspace, see it in the list, and it starts with a Welcome page', async ({ request }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'THOTH-027 E2E Workspace' },
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = await getData<{ id: string; name: string; slug: string }>(createResponse);

    expect(created.name).toBe('THOTH-027 E2E Workspace');
    expect(created.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);

    const listResponse = await request.get('/api/v1/workspaces');
    expect(listResponse.ok()).toBeTruthy();
    const workspaces = await getData<{ id: string }[]>(listResponse);
    expect(workspaces.some((workspace) => workspace.id === created.id)).toBeTruthy();
    // The pre-existing seeded workspace must still be present alongside the new one.
    expect(workspaces.some((workspace) => workspace.id === SEED.workspace.id)).toBeTruthy();
  });

  test('pages created in one workspace are isolated from another', async ({ request }) => {
    const workspaceAResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'Isolation Workspace A' },
    });
    const workspaceA = await getData<{ id: string }>(workspaceAResponse);

    const workspaceBResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'Isolation Workspace B' },
    });
    const workspaceB = await getData<{ id: string }>(workspaceBResponse);

    const pageResponse = await request.post('/api/v1/pages', {
      data: { name: 'Only in workspace A', emoji: null, parentId: null, workspaceId: workspaceA.id },
    });
    expect(pageResponse.ok()).toBeTruthy();
    const page = await getData<{ id: string }>(pageResponse);

    const treeAResponse = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspaceA.id } });
    const treeA = await getData<{ branches: { page: { id: string } }[] }>(treeAResponse);
    expect(treeA.branches.some((branch) => branch.page.id === page.id)).toBeTruthy();

    const treeBResponse = await request.get('/api/v1/pages/tree', { params: { workspaceId: workspaceB.id } });
    const treeB = await getData<{ branches: { page: { id: string } }[] }>(treeBResponse);
    expect(treeB.branches.some((branch) => branch.page.id === page.id)).toBeFalsy();
  });

  test('POST /pages/welcome is scoped per workspace and does not leak the other workspace welcome page', async ({
    request,
  }) => {
    const workspaceAResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'Welcome Bug Workspace A' },
    });
    const workspaceA = await getData<{ id: string }>(workspaceAResponse);

    const workspaceBResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'Welcome Bug Workspace B' },
    });
    const workspaceB = await getData<{ id: string }>(workspaceBResponse);

    // Each new workspace is created with its own Welcome page already (via createWorkspaceForUser),
    // so calling POST /pages/welcome for each must return that workspace's own page — not the
    // other workspace's — verifying the cross-workspace idempotency-check bug fix.
    const welcomeAResponse = await request.post('/api/v1/pages/welcome', {
      data: { workspaceId: workspaceA.id },
    });
    expect(welcomeAResponse.ok()).toBeTruthy();
    const welcomeA = await getData<{ id: string }>(welcomeAResponse);

    const welcomeBResponse = await request.post('/api/v1/pages/welcome', {
      data: { workspaceId: workspaceB.id },
    });
    expect(welcomeBResponse.ok()).toBeTruthy();
    const welcomeB = await getData<{ id: string }>(welcomeBResponse);

    expect(welcomeA.id).not.toBe(welcomeB.id);
  });

  test('can rename a workspace and change its slug', async ({ request }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'Rename Me' },
    });
    const workspace = await getData<{ id: string }>(createResponse);

    // Use a per-run-unique slug: the e2e SQLite DB persists across local runs and the seed only
    // upserts (never purges), so a fixed slug would collide (409) on the second run.
    const newSlug = `renamed-workspace-e2e-${Date.now()}`;
    const patchResponse = await request.patch(`/api/v1/workspaces/${workspace.id}`, {
      data: { name: 'Renamed Workspace', slug: newSlug },
    });
    expect(patchResponse.ok()).toBeTruthy();
    const updated = await getData<{ name: string; slug: string }>(patchResponse);

    expect(updated.name).toBe('Renamed Workspace');
    expect(updated.slug).toBe(newSlug);
  });

  test('slug-availability reflects reserved words and existing slugs as unavailable', async ({ request }) => {
    const reservedResponse = await request.get('/api/v1/workspaces/slug-availability', {
      params: { slug: 'new' },
    });
    expect(reservedResponse.ok()).toBeTruthy();
    const reservedData = await getData<{ available: boolean }>(reservedResponse);
    expect(reservedData.available).toBe(false);

    const takenResponse = await request.get('/api/v1/workspaces/slug-availability', {
      params: { slug: SEED.workspace.slug },
    });
    expect(takenResponse.ok()).toBeTruthy();
    const takenData = await getData<{ available: boolean }>(takenResponse);
    expect(takenData.available).toBe(false);

    const freeResponse = await request.get('/api/v1/workspaces/slug-availability', {
      params: { slug: `unclaimed-slug-${Date.now()}` },
    });
    expect(freeResponse.ok()).toBeTruthy();
    const freeData = await getData<{ available: boolean }>(freeResponse);
    expect(freeData.available).toBe(true);
  });

  test('the seeded second workspace is listed and its pages stay isolated from the first', async ({ request }) => {
    const listResponse = await request.get('/api/v1/workspaces');
    const workspaces = await getData<{ id: string }[]>(listResponse);
    expect(workspaces.some((workspace) => workspace.id === SEED.workspace.id)).toBeTruthy();
    expect(workspaces.some((workspace) => workspace.id === SEED.secondWorkspace.id)).toBeTruthy();

    // The second workspace's own seeded root page shows up in its tree...
    const treeTwoResponse = await request.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.secondWorkspace.id },
    });
    const treeTwo = await getData<{ branches: { page: { id: string } }[] }>(treeTwoResponse);
    expect(treeTwo.branches.some((branch) => branch.page.id === SEED.secondWorkspace.rootPage.id)).toBeTruthy();

    // ...but it must never leak into the first workspace's tree.
    const treeOneResponse = await request.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.workspace.id },
    });
    const treeOne = await getData<{ branches: { page: { id: string } }[] }>(treeOneResponse);
    expect(treeOne.branches.some((branch) => branch.page.id === SEED.secondWorkspace.rootPage.id)).toBeFalsy();
  });

  test('cannot delete the only active workspace, but can delete and restore an extra one', async ({ request }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: 'Disposable Workspace' },
    });
    const disposable = await getData<{ id: string }>(createResponse);

    // Deleting the extra workspace succeeds.
    const deleteResponse = await request.delete(`/api/v1/workspaces/${disposable.id}`);
    expect(deleteResponse.status()).toBe(204);

    // It no longer appears in the active list.
    const listAfterDeleteResponse = await request.get('/api/v1/workspaces');
    const listAfterDelete = await getData<{ id: string }[]>(listAfterDeleteResponse);
    expect(listAfterDelete.some((workspace) => workspace.id === disposable.id)).toBeFalsy();

    // Restoring it within the grace period brings it back.
    const restoreResponse = await request.post(`/api/v1/workspaces/${disposable.id}/restore`);
    expect(restoreResponse.ok()).toBeTruthy();
    const restored = await getData<{ id: string }>(restoreResponse);
    expect(restored.id).toBe(disposable.id);

    const listAfterRestoreResponse = await request.get('/api/v1/workspaces');
    const listAfterRestore = await getData<{ id: string }[]>(listAfterRestoreResponse);
    expect(listAfterRestore.some((workspace) => workspace.id === disposable.id)).toBeTruthy();

    // Delete every active workspace except the shared seed workspace, so exactly one active
    // workspace (the seed workspace) remains for the guard check below. This is intentionally
    // scoped to never touch `SEED.workspace.id` itself.
    const activeWorkspacesResponse = await request.get('/api/v1/workspaces');
    const activeWorkspaces = await getData<{ id: string }[]>(activeWorkspacesResponse);
    for (const workspace of activeWorkspaces) {
      if (workspace.id === SEED.workspace.id) {
        continue;
      }
      await request.delete(`/api/v1/workspaces/${workspace.id}`);
    }

    const remainingResponse = await request.get('/api/v1/workspaces');
    const remaining = await getData<{ id: string }[]>(remainingResponse);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(SEED.workspace.id);

    // The last remaining active workspace (the seed workspace) cannot be deleted.
    const lastDeleteResponse = await request.delete(`/api/v1/workspaces/${SEED.workspace.id}`);
    expect(lastDeleteResponse.status()).toBe(400);

    // Restore the seeded second workspace we soft-deleted in the loop above, so the database
    // returns to its seeded shape for any later specs / re-runs that rely on it being active.
    const restoreSecondResponse = await request.post(`/api/v1/workspaces/${SEED.secondWorkspace.id}/restore`);
    expect(restoreSecondResponse.ok()).toBeTruthy();
  });
});
