import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('ViewCreator dialog is visible with expected form elements', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await page.getByRole('button', { name: 'Add View' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create View' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button').first()).toBeVisible();
});

test('can create a data view through the UI and the new tab appears', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  await page.getByRole('button', { name: 'Add View' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create View' });
  const viewName = `UI-Created View ${Date.now()}`;

  // Step 1: pick an existing data source. Mantine's Select renders a combobox, not a
  // native <select>, so it must be driven by clicking the input and then the option.
  await dialog.getByLabel('Select an existing Data Source').click();
  await page.getByRole('option', { name: SEED.dataSource.name }).click();

  // Step 2: name the new view and submit.
  await dialog.getByLabel('View Name').fill(viewName);
  await dialog.getByRole('button', { name: 'Create View', exact: true }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('tab', { name: viewName })).toBeVisible();
});
