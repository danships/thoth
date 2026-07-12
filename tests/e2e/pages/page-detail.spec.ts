import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('displays seeded page title', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
});

test('displays Contents tab', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('tab', { name: 'Contents' })).toBeVisible();
});

test('shows Add View button', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await expect(page.getByRole('button', { name: 'Add View' })).toBeVisible();
});

test('can inline-edit the page title', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  const heading = page.getByRole('heading', { name: SEED.pages.root.name });
  await heading.click();
  await heading.press('Control+A');
  await heading.type('Renamed E2E Page');
  await heading.press('Enter');
  await expect(page.getByRole('heading', { name: 'Renamed E2E Page' })).toBeVisible();
});

test('block editor is visible on the Contents tab', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.root.id}`);
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 10_000 });
});

test('child page shows breadcrumb trail back to parent', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.child.id}`);
  await expect(page.getByText(SEED.pages.root.name)).toBeVisible();
});

test('data-source host page shows the seeded view tab', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.dataSourceHost.id}`);
  await expect(page.getByRole('tab', { name: SEED.dataView.name })).toBeVisible();
});
