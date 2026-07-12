import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('can create a root page and is redirected to its detail page', async ({ page }) => {
  await page.goto('/pages/create');
  await page.getByLabel('Page Name').fill('My New Root Page');
  await page.getByRole('button', { name: 'Create Page' }).click();
  await page.waitForURL(/\/pages\//);
  await expect(page.getByRole('heading', { name: 'My New Root Page' })).toBeVisible();
});

test('shows validation error when page name is empty', async ({ page }) => {
  await page.goto('/pages/create');
  await page.getByRole('button', { name: 'Create Page' }).click();
  await expect(page.getByText('Page name is required')).toBeVisible();
});

test('can create a child page via /pages/[parentId]/create', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}/create`);
  await page.getByLabel('Page Name').fill('My New Child Page');
  await page.getByRole('button', { name: 'Create Page' }).click();
  await page.waitForURL(/\/pages\//);
  await expect(page.getByRole('heading', { name: 'My New Child Page' })).toBeVisible();
});
