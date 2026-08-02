import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers the THOTH-026 "Apps" settings screen: the nav entry point, creating an App through
// the form modal, minting a key and seeing its one-time secret, and archiving the App.
test.describe('Apps settings UI', () => {
  test('Apps link is reachable from the workspace menu', async ({ page }) => {
    // Navigate directly to a known page without any linked views, rather than the generic
    // `/pages` redirect-to-most-recently-updated-page flow: since DECISION 1 (THOTH-042) made
    // that landing page workspace-scoped (any root page, not just `SEED.pages.root`), it can
    // land on a page with a view (e.g. `dataSourceHost`), whose client-side `?v=` replace can
    // race with (and clobber) the settings navigation triggered below (see the matching comment
    // in `workspace-menu.spec.ts`). `SEED.pages.root` has no views, so this sidesteps the race.
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
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

    await row.click();
    await expect(page).toHaveURL(/\/settings\/apps\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: label })).toBeVisible();

    await page.getByLabel('New key label').fill('e2e-key');
    await page.getByRole('button', { name: 'Create key' }).click();

    await expect(page.getByText('Copy this key now')).toBeVisible({ timeout: 10_000 });
    const secretInput = page.getByLabel('API key secret');
    await expect(secretInput).toHaveValue(/^thk_/);

    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('link', { name: /Back to Apps/ }).click();
    await expect(page).toHaveURL(`/${SEED.workspace.slug}/settings/apps`, { timeout: 15_000 });

    const archivedRow = page.getByRole('row', { name: new RegExp(label) });
    await archivedRow.getByRole('button', { name: 'Archive App' }).click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();

    await expect(archivedRow.getByText('Archived')).toBeVisible({ timeout: 10_000 });
  });

  test('can mint a key with an expiration date, shown afterwards in the keys table', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E Expiry UI App ${Date.now()}`;

    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page).toHaveURL(/\/settings\/apps\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: label })).toBeVisible();

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const expiresAtValue = nextYear.toISOString().slice(0, 16);

    await page.getByLabel('New key label').fill('e2e-expiring-key');
    await page.getByLabel('Expires at').fill(expiresAtValue);

    const [createKeyResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/keys') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create key' }).click(),
    ]);
    const createKeyBody = await createKeyResponse.json();
    expect(createKeyBody.data.expiresAt).not.toBeNull();

    await expect(page.getByText('Copy this key now')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    const keyRow = page.getByRole('row', { name: /e2e-expiring-key/ });
    await expect(keyRow).toBeVisible();
    const expectedExpiresLabel = nextYear.toLocaleDateString();
    await expect(keyRow.getByRole('cell', { name: expectedExpiresLabel })).toBeVisible();
  });

  test('editing an App pre-fills the form with its existing details', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/settings/apps`);
    await page.waitForLoadState('networkidle');

    const label = `E2E Edit UI App ${Date.now()}`;

    await page.getByRole('button', { name: 'New App' }).click();
    await page.getByLabel('Label').fill(label);
    await page.getByRole('combobox', { name: 'Permission' }).click();
    await page.getByRole('option', { name: 'Read & write' }).click();
    await page.getByRole('button', { name: 'Create App' }).click();

    const row = page.getByRole('row', { name: new RegExp(label) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Edit App' }).click();

    await expect(page.getByRole('heading', { name: 'Edit App' })).toBeVisible();
    await expect(page.getByLabel('Label')).toHaveValue(label);
    await expect(page.getByRole('combobox', { name: 'Permission' })).toHaveValue('Read & write');

    const updatedLabel = `${label} - updated`;
    await page.getByLabel('Label').fill(updatedLabel);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('row', { name: new RegExp(updatedLabel) })).toBeVisible({ timeout: 10_000 });
  });
});
