import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('ViewCreator dialog is visible with expected form elements', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await page.getByRole('button', { name: 'Add View' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create View' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button').first()).toBeVisible();
});

test('can create a data view through the UI and the new tab appears', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await page.getByRole('button', { name: 'Add View' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create View' });

  await dialog.getByLabel('View name').fill('UI-Created View');

  await dialog.getByRole('combobox', { name: /data source/i }).selectOption({ label: SEED.dataSource.name });

  await dialog.getByRole('button', { name: /create/i }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('tab', { name: 'UI-Created View' })).toBeVisible();
});
