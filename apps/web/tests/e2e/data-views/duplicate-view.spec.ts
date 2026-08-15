import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('duplicating the open view creates a new tab named "{name} (copy)" and selects it', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: `"${SEED.dataView.name}" view actions` }).click();
  await page.getByRole('menuitem', { name: 'Duplicate view' }).click();

  const duplicatedTab = page.getByRole('tab', { name: `${SEED.dataView.name} (copy)` });
  await expect(duplicatedTab).toBeVisible({ timeout: 10_000 });
  await expect(duplicatedTab).toHaveAttribute('aria-selected', 'true');

  // The original view's tab is still present, untouched.
  await expect(page.getByRole('tab', { name: SEED.dataView.name, exact: true })).toBeVisible();
});

test('the duplicate action is only visible on the currently open view tab', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);

  // "Contents" is the default tab, so the seeded view's kebab should not be visible yet.
  await expect(page.getByRole('button', { name: `"${SEED.dataView.name}" view actions` })).not.toBeVisible();

  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('button', { name: `"${SEED.dataView.name}" view actions` })).toBeVisible();

  // Switching to another tab hides the action for the previously-open view.
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.getByRole('button', { name: `"${SEED.dataView.name}" view actions` })).not.toBeVisible();
});
