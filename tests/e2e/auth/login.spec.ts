import Database from 'better-sqlite3';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.use({ storageState: { cookies: [], origins: [] } });

function setContainerLastUpdated(containerId: string, lastUpdated: string) {
  const databasePath = process.env['DB']!.replace('sqlite://', '');
  const database = new Database(databasePath);
  try {
    database.prepare(`UPDATE container SET contents = json_set(contents, '$.lastUpdated', ?) WHERE id = ?`).run(
      lastUpdated,
      containerId
    );
  } finally {
    database.close();
  }
}

test('shows email and password fields in credentials mode', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});

test('shows error notification on invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.locator('input[type="password"]').fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 6000 });
});

test('shows link to sign-up page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
});

test('redirects to /pages then to the most recently updated page after successful login', async ({ page }) => {
  // THOTH-042 (DECISION 1): the landing page is now the workspace's most-recently-updated root
  // page (`Container.lastUpdated`), not a per-user `ContainerAccess.lastAccessedAt` row. Since
  // `SEED.workspace` is shared across the whole suite, other specs may have bumped a different
  // root page's `lastUpdated` more recently by the time this test runs. So, deterministically
  // re-assert the invariant under test by writing `SEED.pages.root`'s `lastUpdated` directly
  // (mirroring the `ContainerAccess` freshening pattern in `recent-tree.spec.ts`) immediately
  // before signing in, guaranteeing it is the most recently updated root page at login time.
  setContainerLastUpdated(SEED.pages.root.id, new Date().toISOString());

  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED.user.email);
  await page.locator('input[type="password"]').fill(SEED.user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`, { timeout: 10_000 });
});
