import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// The sidebar's root list is cursor-paginated (default page size well under the 30+ root pages
// seeded here via `SEED.pages.paginationSeed`), so only the most-recently-accessed root pages
// are rendered until the user scrolls to the bottom of the scrollable pane.
//
// The scrollable pane's height is derived from the viewport (`calc(100vh - 120px)`). Additional
// root pages are only fetched in response to an actual scroll event on the pane (not merely
// because a "load more" marker happens to be within the pane's bounds), so a short viewport is
// used here to keep the pane small relative to the seeded content and exercise a genuine
// scroll-to-load-more interaction.
test.use({ viewport: { width: 1280, height: 400 } });

async function scrollPaneToBottom(page: import('@playwright/test').Page) {
  await page.getByTestId('pages-tree-scroll-pane').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
}

test('sidebar loads more root pages as the user scrolls to the bottom', async ({ page }) => {
  await page.goto('/pages');

  const firstPaginationPage = SEED.pages.paginationSeed[0]!;
  const lastPaginationPage = SEED.pages.paginationSeed.at(-1)!;

  // The most-recently-accessed pagination page is within the first fetch...
  await expect(page.getByText(firstPaginationPage.name)).toBeVisible();
  // ...but the least-recently-accessed one is not, until the user scrolls further.
  await expect(page.getByText(lastPaginationPage.name)).not.toBeVisible();

  await scrollPaneToBottom(page);

  await expect(page.getByText(lastPaginationPage.name)).toBeVisible({ timeout: 10_000 });
});

test('sidebar sentinel disappears once every root page has been loaded', async ({ page }) => {
  await page.goto('/pages');

  await scrollPaneToBottom(page);
  await expect(page.getByText(SEED.pages.paginationSeed.at(-1)!.name)).toBeVisible({ timeout: 10_000 });

  // No more pages left to load, so the sentinel used to trigger further loads is gone.
  await expect(page.getByTestId('pages-tree-load-more-sentinel')).toHaveCount(0);
});

// A root page seeded with more children than CHILD_PREVIEW_LIMIT (10) should show a static
// "more inside" indicator rather than listing/paginating all of them inline (out of scope).
test('a root page with more than 10 children shows a "more inside" indicator', async ({ page }) => {
  await page.goto('/pages');

  const hostLink = page.getByRole('link', { name: new RegExp(SEED.pages.childOverflowHost.name) });
  await expect(hostLink).toBeVisible();

  const row = hostLink.locator('..');
  await row.getByRole('button').first().click();

  const firstChild = SEED.pages.childOverflowHost.children.at(0)!;
  const eleventhChild = SEED.pages.childOverflowHost.children.at(10)!;

  await expect(page.getByText(firstChild.name)).toBeVisible();
  await expect(page.getByText(eleventhChild.name)).not.toBeVisible();
  await expect(page.getByText('More inside — open page')).toBeVisible();
});
