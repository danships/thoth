import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('seeded date column header appears in the data view table', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('columnheader', { name: SEED.dataSource.columns[2].name })).toBeVisible();
});

test('seeded date cell value is visible in the data view table', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const dateCell = row.getByRole('cell').nth(3);

  await expect(dateCell.locator('input')).toHaveValue('2026-01-31');
});

test('can edit a date cell value inline', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const dateCell = row.getByRole('cell').nth(3);
  const dateInput = dateCell.locator('input');

  await dateInput.fill('2026-03-15');
  await dateInput.blur();

  await expect(dateInput).toHaveValue('2026-03-15');
});

test('can create a new date column via the Add Column modal', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: 'Add Column' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Column Name').fill('Reminder');
  await page.getByRole('combobox', { name: 'Column Type' }).click();
  await page.getByRole('option', { name: 'Date' }).click();

  await page.getByRole('combobox', { name: 'Date Mode' }).click();
  await page.getByRole('option', { name: 'Date & Time' }).click();

  await page.getByRole('combobox', { name: 'Display Format' }).click();
  await page.getByRole('option', { name: '2026-01-31 14:30' }).click();

  await page.getByRole('button', { name: 'Create Column' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Reminder' })).toBeVisible();
});
