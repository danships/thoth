import Database from 'better-sqlite3';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Logging out invalidates the underlying better-auth session. The default storageState
// (from global.setup.ts) is shared across every other spec in the suite, so signing out
// with that session would break all subsequent tests. To keep this test isolated, it signs
// in with its own dedicated session before exercising the logout flow.
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

test('clicking Logout signs out immediately and lands on /login', async ({ page }) => {
  // THOTH-042 (DECISION 1): the post-login landing page is the workspace's most-recently-updated
  // root page (`Container.lastUpdated`), which is shared/mutable across the whole e2e suite —
  // write `SEED.pages.root`'s `lastUpdated` directly right before signing in so it deterministically
  // wins, regardless of what other specs have touched in `SEED.workspace` (see `login.spec.ts`).
  setContainerLastUpdated(SEED.pages.root.id, new Date().toISOString());

  await page.goto('/login');
  await page.getByLabel('Email').fill(SEED.user.email);
  await page.locator('input[type="password"]').fill(SEED.user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`, { timeout: 10_000 });

  await page.getByRole('button', { name: 'Workspace menu' }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page).toHaveURL('/login', { timeout: 10_000 });

  // Session should really be gone: revisiting a protected route redirects back to /login.
  await page.goto(`/${SEED.workspace.slug}/pages`);
  await expect(page).toHaveURL('/login', { timeout: 10_000 });
});
