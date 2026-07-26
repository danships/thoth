import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.use({ viewport: { width: 390, height: 844 } });

test('data view table scrolls horizontally without scrolling the whole page on mobile', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

  // The page itself should never scroll horizontally.
  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasPageOverflow).toBe(false);

  // The table's own scroll container should be the one that can overflow horizontally.
  const scrollContainer = page.getByTestId('data-table-scroll-container');
  await expect(scrollContainer).toBeVisible();
  const containerOverflow = await scrollContainer.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(containerOverflow).toBe(true);
});
