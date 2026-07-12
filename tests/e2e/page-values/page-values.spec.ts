import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('seeded text cell value is visible in the data view table', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByText('Seeded note')).toBeVisible();
});

test('boolean cell renders in the data view table', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('checkbox').first()).toBeVisible();
});

test('can edit a text cell value inline', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  const cell = page.getByText('Seeded note');
  await cell.dblclick();
  const input = page.getByRole('textbox').first();
  await input.fill('Updated note');
  await input.press('Enter');
  await expect(page.getByText('Updated note')).toBeVisible();
});
