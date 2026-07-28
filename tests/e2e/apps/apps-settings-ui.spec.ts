import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers the THOTH-026 "Apps" settings screen: the nav entry point, creating an App through
// the form modal, minting a key and seeing its one-time secret, and archiving the App.
test.describe('Apps settings UI', () => {
  test('Apps link is reachable from the workspace menu', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);

    // `/[slug]/pages` redirects on to the landing page, which may then append a `?v=` view param
    // via a client-side replace. Let that settle before interacting with the menu, otherwise the
    // late replace can race with (and clobber) the settings navigation triggered below (see the
    // matching comment in `workspace-menu.spec.ts`).
    await page.waitForURL(/\/pages\/(?!create)[^/]+/);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Workspace menu' }).click();
    await page.getByRole('menuitem', { name: 'Apps' }).click();

    await expect(page).toHaveURL(`/${SEED.workspace.slug}/settings/apps`, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  });

  test('can create an App, mint a key, view its one-time secret, and archive the App', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E UI App ${Date.now()}`;

    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Manage keys' }).click();
    await expect(page.getByRole('heading', { name: label })).toBeVisible();

    await page.getByLabel('New key label').fill('e2e-key');
    await page.getByRole('button', { name: 'Create key' }).click();

    await expect(page.getByText('Copy this key now')).toBeVisible({ timeout: 10_000 });
    const secretInput = page.getByLabel('API key secret');
    await expect(secretInput).toHaveValue(/^thk_/);

    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Close' }).last().click();

    const archivedRow = page.getByRole('row', { name: new RegExp(label) });
    await archivedRow.getByRole('button', { name: 'Archive App' }).click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();

    await expect(archivedRow.getByText('Archived')).toBeVisible({ timeout: 10_000 });
  });
});
