import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers the legacy (pre-multi-workspace) bare `/pages` and `/pages/[id]` URLs added in
// THOTH-027. These must keep working by redirecting into the correct workspace-prefixed URL:
// `/pages/[id]` derives the workspace from the page itself, while bare `/pages` lands in the
// user's default/last-used workspace.
test.describe('legacy URL redirects', () => {
  test('bare /pages/[id] redirects to the owning workspace-prefixed URL', async ({ page }) => {
    // The target does a server-side redirect; wait only for the navigation to commit (not full
    // load of the intermediate response) to avoid `ERR_NETWORK_IO_SUSPENDED` on the aborted load.
    await page.goto(`/pages/${SEED.pages.root.id}`, { waitUntil: 'commit' });

    // The seeded root page lives in `SEED.workspace`, so the redirect target is deterministic.
    await expect(page).toHaveURL(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`, { timeout: 15_000 });
  });

  test('bare /pages/[id] preserves the ?v= selected-view query parameter', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.dataSourceHost.id}?v=${SEED.dataView.id}`, { waitUntil: 'commit' });

    await expect(page).toHaveURL(
      `/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}?v=${SEED.dataView.id}`,
      { timeout: 15_000 }
    );
  });

  test('bare /pages redirects into a workspace-prefixed pages URL', async ({ page }) => {
    await page.goto('/pages', { waitUntil: 'commit' });

    // Which workspace we land in depends on the user's last-used/default workspace (other specs
    // may have changed it), and `/[slug]/pages` itself redirects on to the landing page, so only
    // assert the shape (workspace-prefixed pages URL), not the exact slug or page id.
    await expect(page).toHaveURL(/\/[^/]+\/pages(\/|$)/, { timeout: 15_000 });
  });
});
