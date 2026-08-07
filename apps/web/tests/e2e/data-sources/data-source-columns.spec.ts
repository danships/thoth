import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('seeded data source columns appear in data view table header', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('columnheader', { name: SEED.dataSource.columns[0].name })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: SEED.dataSource.columns[1].name })).toBeVisible();
});
