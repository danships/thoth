import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('Add View modal opens on a page', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await page.getByRole('button', { name: 'Add View' }).click();
  await expect(page.getByRole('dialog', { name: 'Create View' })).toBeVisible();
});

test('ViewCreator dialog can be closed', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await page.getByRole('button', { name: 'Add View' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
