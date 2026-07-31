import type { APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T>(response: APIResponse) {
  const body = await response.json();
  return body.data as T;
}

test('sidebar shows Pages heading', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
});

test('sidebar shows add-page link', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);
  await expect(page.getByRole('link', { name: 'Add page' })).toBeVisible();
});

test('sidebar shows Trash button', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);
  await expect(page.getByRole('button', { name: 'Trash' })).toBeVisible();
});

test('seeded root page appears in sidebar', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);
  // Root also appears in the Recent section (per THOTH-035), so scope to the Pages tree.
  await expect(page.getByTestId('pages-tree-scroll-pane').getByText(SEED.pages.root.name)).toBeVisible();
});

test('seeded data source host page appears in sidebar', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);
  // Also appears in the Recent section (per THOTH-035), so scope to the Pages tree.
  await expect(page.getByTestId('pages-tree-scroll-pane').getByText(SEED.pages.dataSourceHost.name)).toBeVisible();
});

test('/ redirects through /pages to the most recently updated root page', async ({ page }) => {
  const workspacesResponse = await page.request.get('/api/v1/workspaces');
  const workspaces = await getData<Array<{ id: string; slug: string; lastUpdated: string }>>(workspacesResponse);
  const targetWorkspace = workspaces.toSorted((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1))[0];

  expect(targetWorkspace).toBeTruthy();

  const treeResponse = await page.request.get(`/api/v1/pages/tree?workspaceId=${targetWorkspace!.id}`);
  const tree = await getData<{ branches: Array<{ page: { id: string } }> }>(treeResponse);
  const expectedPageId = tree.branches[0]?.page.id;

  await page.goto('/');
  await expect(page).toHaveURL(`/${targetWorkspace!.slug}/pages/${expectedPageId}`, { timeout: 10_000 });
});
