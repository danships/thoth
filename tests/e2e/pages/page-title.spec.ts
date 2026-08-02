import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// THOTH-046: every rendered page must have a `<title>` ending in " :: thoth", and the page
// detail view must fold in the page name (and, if one is selected, the active view's name).
test.describe('Page titles', () => {
  test('workspace pages list has a title', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);
    await expect(page).toHaveTitle(/:: thoth$/);
    await expect(page).toHaveTitle('Pages :: thoth');
  });

  test('workspace settings has a title', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings`);
    await expect(page).toHaveTitle('Settings :: thoth');
  });

  test('apps settings has a title', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await expect(page).toHaveTitle('Apps :: thoth');
  });

  test('page detail title includes the page name', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
    await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
    await expect(page).toHaveTitle(`${SEED.pages.root.name} - Contents :: thoth`);
  });

  test('page detail title includes the selected view name', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}?v=${SEED.dataView.id}`);
    await expect(page).toHaveTitle(`${SEED.pages.dataSourceHost.name} - ${SEED.dataView.name} :: thoth`);
  });
});

// Guest-only route: needs an unauthenticated session, unlike the rest of this file.
test.describe('Login page title', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page has a title', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle('Login :: thoth');
  });
});
