import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers the sidebar's workspace menu (added in response to THOTH-027 review feedback): it
// replaces the header's old plain "Logout" link, and is the only UI entry point for switching
// between workspaces, creating a new one, and reaching Workspace Settings.
test.describe('workspace menu', () => {
  test('header no longer shows a Logout link', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Logout' })).toHaveCount(0);
  });

  test('shows the current workspace name and links to its settings page', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);

    // `/[slug]/pages` redirects on to the landing page, which may then append a `?v=` view param
    // via a client-side replace. Let that settle before interacting with the menu, otherwise the
    // late replace can race with (and clobber) the settings navigation triggered below.
    await page.waitForURL(/\/pages\/(?!create)[^/]+/);
    await page.waitForLoadState('networkidle');

    const menuTrigger = page.getByRole('button', { name: 'Workspace menu' });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();

    await expect(page.getByRole('menuitem', { name: /\(current\)/ })).toBeVisible();

    await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
    // First navigation to a lazily-compiled route can be slow under `next dev`/Turbopack.
    await expect(page).toHaveURL(`/${SEED.workspace.slug}/settings`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
  });

  test('can create a new workspace from the menu and switches into it', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);

    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await page.getByRole('menuitem', { name: 'New workspace' }).click();

    const workspaceName = `E2E Menu Workspace ${Date.now()}`;
    await page.getByLabel('Workspace name').fill(workspaceName);
    await page.getByRole('button', { name: 'Create workspace' }).click();

    // Creating navigates into the new workspace's Pages view, which forwards on to its seeded
    // Welcome page (`/[slug]/pages/[welcomeId]`), so tolerate the trailing page id.
    await expect(page).toHaveURL(/\/[^/]+\/pages(\/|$)/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible({ timeout: 10_000 });

    // The new workspace is now current, and the original seeded one is listed as switchable.
    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await expect(page.getByRole('menuitem', { name: `${workspaceName} (current)` })).toBeVisible();
  });

  test('can switch back to another existing workspace from the menu', async ({ page, request }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: `E2E Switch Target ${Date.now()}` },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const created = createBody.data as { slug: string; name: string };

    await page.goto(`/${SEED.workspace.slug}/pages`);
    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await page.getByRole('menuitem', { name: created.name }).click();

    // Switching lands on the target workspace's Pages view, which forwards on to its landing
    // page, so match the slug prefix rather than an exact `/pages` URL.
    await expect(page).toHaveURL(new RegExp(`/${created.slug}/pages(/|$)`), { timeout: 10_000 });
  });

  test('can log out from the workspace menu', async ({ page }) => {
    // Signs in with its own dedicated session (rather than the shared default storageState)
    // since logging out invalidates the underlying better-auth session, which would otherwise
    // break every other spec in the suite that reuses the same storageState. See the matching
    // comment in `tests/e2e/auth/logout.spec.ts`.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email').fill(SEED.user.email);
    await page.locator('input[type="password"]').fill(SEED.user.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Don't assert which workspace we land in: earlier tests in this suite may have switched
    // the "most recently accessed" workspace for this user, changing where login redirects to.
    await expect(page).toHaveURL(/\/[^/]+\/pages(\/|$)/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();

    await expect(page).toHaveURL('/login', { timeout: 10_000 });
  });
});
