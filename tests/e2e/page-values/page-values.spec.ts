import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('seeded text cell value is visible in the data view table', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByText('Seeded note')).toBeVisible();
});

test('boolean cell renders in the data view table', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('checkbox').first()).toBeVisible();
});

test('can edit a text cell value inline', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  // Locate the row by its stable "OPEN" link (page link text never changes) rather than by
  // the cell's own text, since editing that text would invalidate a locator built on it.
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const noteCell = row.getByRole('cell').nth(1);

  await noteCell.click();
  await noteCell.press('Control+A');
  await noteCell.pressSequentially('Updated note');
  await noteCell.press('Enter');
  await expect(noteCell).toHaveText('Updated note');
});
