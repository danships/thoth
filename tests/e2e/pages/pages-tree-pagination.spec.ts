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

// Each scroll-to-bottom only triggers a single "load more" fetch — repeatedly scroll (bounded,
// so a stuck sentinel fails the test instead of hanging) until pagination is fully exhausted
// (the load-more sentinel is removed from the DOM).
async function scrollUntilPaginationExhausted(page: import('@playwright/test').Page) {
  // Wait for the initial page to finish loading before checking the sentinel — otherwise, while
  // the tree is still loading (and the scroll pane/sentinel haven't rendered yet), the sentinel's
  // absence would be mistaken for "pagination already exhausted".
  await expect(page.getByTestId('pages-tree-scroll-pane')).toBeVisible();

  const sentinel = page.getByTestId('pages-tree-load-more-sentinel');
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if ((await sentinel.count()) === 0) {
      return;
    }
    await scrollPaneToBottom(page);
    await page.waitForTimeout(250);
  }
  await expect(sentinel).toHaveCount(0);
}

test('sidebar loads more root pages as the user scrolls to the bottom', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);

  const firstPaginationPage = SEED.pages.paginationSeed[0]!;
  const lastPaginationPage = SEED.pages.paginationSeed.at(-1)!;

  // Wait for the tree pane itself before asserting on its contents — otherwise, on a slow first
  // render (e.g. a cold dev-server compile), the pane/content may simply not have mounted yet
  // within the default assertion timeout, which is unrelated to the pagination behaviour under
  // test.
  await expect(page.getByTestId('pages-tree-scroll-pane')).toBeVisible({ timeout: 10_000 });

  // The most-recently-accessed pagination page is within the first fetch. Scoped to the Pages
  // tree since (per THOTH-035) it now also appears in the sidebar's Recent section.
  await expect(page.getByTestId('pages-tree-scroll-pane').getByText(firstPaginationPage.name)).toBeVisible({
    timeout: 10_000,
  });
  // ...but the least-recently-accessed one is not, until the user scrolls further.
  await expect(page.getByText(lastPaginationPage.name)).not.toBeVisible();

  await scrollUntilPaginationExhausted(page);

  await expect(page.getByText(lastPaginationPage.name)).toBeVisible({ timeout: 10_000 });
});

test('sidebar sentinel disappears once every root page has been loaded', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);

  await scrollUntilPaginationExhausted(page);
  await expect(page.getByText(SEED.pages.paginationSeed.at(-1)!.name)).toBeVisible({ timeout: 10_000 });

  // No more pages left to load, so the sentinel used to trigger further loads is gone.
  await expect(page.getByTestId('pages-tree-load-more-sentinel')).toHaveCount(0);
});

// A root page seeded with more children than CHILD_PREVIEW_LIMIT (10) should show a static
// "more inside" indicator rather than listing/paginating all of them inline (out of scope).
test('a root page with more than 10 children shows a "more inside" indicator', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages`);

  const hostLink = page.getByTestId('pages-tree-scroll-pane').getByRole('link', {
    name: new RegExp(SEED.pages.childOverflowHost.name),
  });
  await expect(hostLink).toBeVisible();

  const row = hostLink.locator('..');
  await row.getByRole('button').first().click();

  const firstChild = SEED.pages.childOverflowHost.children.at(0)!;
  const eleventhChild = SEED.pages.childOverflowHost.children.at(10)!;

  await expect(page.getByTestId('pages-tree-scroll-pane').getByText(firstChild.name)).toBeVisible();
  await expect(page.getByText(eleventhChild.name)).not.toBeVisible();

  const moreInsideLink = page.getByRole('link', { name: 'More inside — open page' });
  await expect(moreInsideLink).toBeVisible();
  await expect(moreInsideLink).toHaveAttribute(
    'href',
    `/${SEED.workspace.slug}/pages/${SEED.pages.childOverflowHost.id}`
  );

  await moreInsideLink.click();
  await expect(page).toHaveURL(`/${SEED.workspace.slug}/pages/${SEED.pages.childOverflowHost.id}`);
});
