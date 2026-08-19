import { type Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.describe('data view page width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function expectWideTabsRegion(page: Page) {
    const navigation = await page.getByRole('navigation').boundingBox();
    expect(navigation).not.toBeNull();

    const width = await page
      .getByTestId('page-tabs-region')
      .evaluate((element) => element.getBoundingClientRect().width);
    const expectedWidth = page.viewportSize()!.width - navigation!.width;

    expect(width).toBeCloseTo(expectedWidth, 0);
  }

  test('keeps the whole tabs region wide on every tab of a page with a DataView', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);

    // Assert the wide layout before selecting another tab to ensure it is derived from
    // page-level view presence, not tab selection.
    await expect(page.getByTestId('page-tabs-region')).toBeVisible({ timeout: 10_000 });
    await expectWideTabsRegion(page);

    await page.getByRole('tab', { name: 'Contents' }).click();
    await expectWideTabsRegion(page);

    await page.getByRole('tab', { name: SEED.dataView.name }).click();
    await expect(page).toHaveURL(new RegExp(`\\?v=${SEED.dataView.id}$`));
    await expectWideTabsRegion(page);
  });

  test('keeps a page without DataViews at the reading width', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    const width = await page
      .getByTestId('page-tabs-region')
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(992);
  });
});

test.describe('data view page width on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('does not cause page-level horizontal overflow', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
    await expect(page.getByTestId('page-tabs-region')).toBeVisible();

    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasPageOverflow).toBe(false);
  });
});
