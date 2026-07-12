import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('sidebar shows Pages heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
});

test('sidebar shows add-page link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Add page' })).toBeVisible();
});

test('seeded root page appears in sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(SEED.pages.root.name)).toBeVisible();
});

test('seeded data source host page appears in sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(SEED.pages.dataSourceHost.name)).toBeVisible();
});
