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
  // Use a name-agnostic locator: the title's accessible name changes as soon as we start
  // typing, so a locator filtered by the original name would stop matching mid-interaction.
  const heading = page.getByRole('heading', { level: 1 });
  await heading.click();
  await heading.press('Control+A');
  await heading.pressSequentially('Renamed E2E Page');
  await heading.press('Enter');
  await expect(page.getByRole('heading', { name: 'Renamed E2E Page' })).toBeVisible();

  // Restore the seeded name afterwards so other specs that rely on SEED.pages.root.name
  // (a shared, pre-seeded page) keep working regardless of test execution order.
  await heading.click();
  await heading.press('Control+A');
  await heading.pressSequentially(SEED.pages.root.name);
  await heading.press('Enter');
  await expect(page.getByRole('heading', { name: SEED.pages.root.name })).toBeVisible();
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
