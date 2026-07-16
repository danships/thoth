import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('seeded data view tab renders the DataViewTable', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
});

test('seeded data row appears in the data view table', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByText(SEED.dataSourcePage.name)).toBeVisible();
});
