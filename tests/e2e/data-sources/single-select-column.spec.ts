import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

const priorityColumn = SEED.dataSource.columns[3];

// NOTE: tests in this file run sequentially against a shared, seeded backend (see
// `playwright.config.ts`'s `workers: 1`), so ordering matters — tests that read the seeded
// "Medium" option must run before tests that change the row's selected option away from it.

test('seeded single-select column header appears in the data view table', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('columnheader', { name: priorityColumn.name })).toBeVisible();
});

test('seeded single-select cell value renders as a colored badge', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const selectCell = row.getByRole('cell').nth(4);

  await expect(selectCell.getByText(priorityColumn.options[1].label)).toBeVisible();
});

test('renaming an option via Edit Column updates previously-set cells without changing the underlying value', async ({
  page,
}) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const columnHeader = page.getByRole('columnheader', { name: priorityColumn.name });
  await columnHeader.getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();

  const optionLabelInputs = page.getByPlaceholder('Option label');
  // The seeded Medium option is the second row in the options editor.
  await optionLabelInputs.nth(1).fill('In Progress');

  await page.getByRole('button', { name: 'Update Column' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const selectCell = row.getByRole('cell').nth(4);
  await expect(selectCell.getByText('In Progress')).toBeVisible();
});

test('can pick a different existing option for a single-select cell', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const selectCell = row.getByRole('cell').nth(4);

  await selectCell.getByTestId('single-select-cell-target').click();
  await page.getByRole('option', { name: priorityColumn.options[2].label }).click();

  await expect(selectCell.getByText(priorityColumn.options[2].label)).toBeVisible();
});

test('can create a new option from the single-select cell dropdown', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const selectCell = row.getByRole('cell').nth(4);

  await selectCell.getByTestId('single-select-cell-target').click();
  const searchInput = page.locator('input[placeholder="Search or create option"][data-expanded="true"]');
  await searchInput.fill('Urgent');
  await page.getByRole('option', { name: `+ Create "Urgent"` }).click();

  await expect(selectCell.getByText('Urgent')).toBeVisible();

  // Reopening the dropdown should now list the newly created option alongside the seeded ones.
  await selectCell.getByTestId('single-select-cell-target').click();
  await expect(page.getByRole('option', { name: priorityColumn.options[0].label })).toBeVisible();

  // Searching for the label just created should offer the existing option rather than a second
  // "+ Create" action, verifying the case-insensitive idempotency of the create endpoint.
  await searchInput.fill('Urgent');
  await expect(page.getByRole('option', { name: 'Urgent' })).toBeVisible();
  await expect(page.getByRole('option', { name: '+ Create "Urgent"' })).toHaveCount(0);
});

test('can create a new single-select column via the Add Column modal', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: 'Add Column' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Column Name').fill('Status');
  await page.getByRole('combobox', { name: 'Column Type' }).click();
  await page.getByRole('option', { name: 'Single select' }).click();

  // Selecting "single-select" no longer forces an initial option row — options are added via
  // "Add option" here (optional), or later inline from the table cell.
  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByPlaceholder('Option label').first().fill('Open');

  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByPlaceholder('Option label').nth(1).fill('Closed');

  await page.getByRole('button', { name: 'Create Column' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
});

test('can create a single-select column with zero options and add options inline from the table', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: 'Add Column' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Column Name').fill('Empty Status');
  await page.getByRole('combobox', { name: 'Column Type' }).click();
  await page.getByRole('option', { name: 'Single select' }).click();

  // No option label input is required to create the column.
  await expect(page.getByPlaceholder('Option label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create Column' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Empty Status' })).toBeVisible();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const selectCell = row.getByRole('cell').last();

  await selectCell.getByTestId('single-select-cell-target').click();
  // Multiple single-select cells stay mounted in the DOM even when their dropdown is closed —
  // scope to the one currently expanded to avoid a strict-mode violation on the shared
  // "Search or create option" placeholder.
  const searchInput = page.locator('input[placeholder="Search or create option"][data-expanded="true"]');
  await searchInput.fill('Backlog');
  await page.getByRole('option', { name: `+ Create "Backlog"` }).click();

  await expect(selectCell.getByText('Backlog')).toBeVisible();
});
