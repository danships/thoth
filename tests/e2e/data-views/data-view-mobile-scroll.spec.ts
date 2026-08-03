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

test('long inline Markdown stays on one line and ellipsises inside its cell', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

  const row = page
    .getByRole('row')
    .filter({ hasText: SEED.dataSource.longMarkdownRow.name });
  const cell = row.getByRole('cell').nth(1);
  await expect(cell).toBeVisible();

  const overflowsCleanly = await cell.evaluate((element) => {
    const rendered = element.querySelector('span');
    if (!rendered) return false;
    const style = getComputedStyle(rendered);
    return (
      style.whiteSpace === 'nowrap' &&
      style.textOverflow === 'ellipsis' &&
      // The rendered content's own scroll box overflows (long text/code), but it never grows
      // taller than a single line.
      rendered.scrollHeight <= rendered.clientHeight + 1
    );
  });
  expect(overflowsCleanly).toBe(true);

  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasPageOverflow).toBe(false);
});
