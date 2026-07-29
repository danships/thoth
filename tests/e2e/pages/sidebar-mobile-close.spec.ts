import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Mantine's AppShell collapses the mobile navbar overlay via a CSS `transform: translateX(...)`
// rather than `display: none`, so Playwright's `toBeVisible()`/`toBeHidden()` (which don't
// consider whether an element is scrolled/transformed out of the viewport) can't detect the
// collapse. `toBeInViewport()` checks actual viewport intersection, which is exactly what
// "the overlay no longer covers the screen" means here.
test.describe('sidebar closes on mobile navigation', () => {
  test.describe('mobile', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('closes the navbar after clicking a page link', async ({ page }) => {
      await page.goto(`/${SEED.workspace.slug}/pages`);

      // Open the mobile navbar via the Burger (rendered as a button, hiddenFrom="sm").
      const burger = page.getByRole('button', { name: /toggle navigation/i });
      await burger.click();

      // Sidebar is open: its "Pages" heading and the seeded page link are visible on screen.
      const pagesHeading = page.getByRole('heading', { name: 'Pages' });
      await expect(pagesHeading).toBeInViewport();
      // Scoped to the Pages tree since (per THOTH-035) the page also appears in the sidebar's
      // Recent section.
      const pageLink = page.getByTestId('pages-tree-scroll-pane').getByRole('link', { name: SEED.pages.root.name });
      await expect(pageLink).toBeVisible({ timeout: 10_000 });

      await pageLink.click();

      // URL changed to the page detail route.
      await expect(page).toHaveURL(new RegExp(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`), {
        timeout: 10_000,
      });

      // Sidebar overlay is closed: the "Pages" heading has scrolled off-screen...
      await expect(pagesHeading).not.toBeInViewport({ timeout: 10_000 });
      // ...and the destination page heading is visible.
      await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
    });

    test('closes the navbar after clicking a view (?v=) link', async ({ page }) => {
      // Required: view navigation must close the sidebar (see Resolved Decisions).
      await page.goto(`/${SEED.workspace.slug}/pages`);
      const burger = page.getByRole('button', { name: /toggle navigation/i });
      await burger.click();
      const pagesHeading = page.getByRole('heading', { name: 'Pages' });
      await expect(pagesHeading).toBeInViewport();

      // Expand the tree node for the data-source host page to reveal its view link. Scoped to
      // the Pages tree since (per THOTH-035) it also appears (as a leaf, without an expand
      // toggle) in the sidebar's Recent section.
      const dataSourceRow = page
        .getByTestId('pages-tree-scroll-pane')
        .getByRole('link', { name: SEED.pages.dataSourceHost.name })
        .locator('xpath=ancestor::div[1]');
      const expandToggle = dataSourceRow.getByRole('button', { name: 'Expand tree item' });
      await expect(expandToggle).toBeVisible({ timeout: 10_000 });
      await expandToggle.click();

      const viewLink = page.getByRole('link', { name: SEED.dataView.name });
      await expect(viewLink).toBeVisible();
      await viewLink.click();

      await expect(page).toHaveURL(/\?v=/, { timeout: 10_000 });
      // Even though only the query string changed, the sidebar overlay still closes.
      await expect(pagesHeading).not.toBeInViewport({ timeout: 10_000 });
    });
  });

  test.describe('desktop regression', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('sidebar stays visible after navigation on desktop', async ({ page }) => {
      await page.goto(`/${SEED.workspace.slug}/pages`);

      const pageLink = page.getByTestId('pages-tree-scroll-pane').getByRole('link', { name: SEED.pages.root.name });
      await expect(pageLink).toBeVisible({ timeout: 10_000 });
      await pageLink.click();

      await expect(page).toHaveURL(new RegExp(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`), {
        timeout: 10_000,
      });
      // On desktop the navbar is always shown regardless of the disclosure state.
      await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
    });
  });
});
