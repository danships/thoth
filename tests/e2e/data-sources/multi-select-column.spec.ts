import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

const tagsColumn = SEED.dataSource.columns[4];

// NOTE: tests in this file run sequentially against a shared, seeded backend (see
// `playwright.config.ts`'s `workers: 1`), so ordering matters — tests that read the seeded
// "Frontend"/"Urgent" selection must run before tests that change the row's selected options.

test('seeded multi-select column header appears in the data view table', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('columnheader', { name: tagsColumn.name })).toBeVisible();
});

test('seeded multi-select cell value renders multiple badges', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const tagsCell = row.getByRole('cell').nth(6);

  await expect(tagsCell.getByText(tagsColumn.options[0].label)).toBeVisible();
  await expect(tagsCell.getByText(tagsColumn.options[2].label)).toBeVisible();
});

test('can select an additional option for a multi-select cell', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const tagsCell = row.getByRole('cell').nth(6);

  await tagsCell.getByTestId('multi-select-cell-target').click();
  await page.getByRole('option', { name: tagsColumn.options[1].label }).click();
  await page.keyboard.press('Escape');

  await expect(tagsCell.getByText(tagsColumn.options[0].label)).toBeVisible();
  await expect(tagsCell.getByText(tagsColumn.options[1].label)).toBeVisible();
  await expect(tagsCell.getByText(tagsColumn.options[2].label)).toBeVisible();

  // Restore the seeded selection so this test doesn't leave shared backend state behind for
  // other tests in this file (they run sequentially against the same seeded row).
  await tagsCell
    .getByTestId('multi-select-cell-target')
    .getByRole('button', { name: `Remove ${tagsColumn.options[1].label}` })
    .click();
  await expect(tagsCell.getByText(tagsColumn.options[1].label)).not.toBeVisible();
});

test('can deselect an option from a multi-select cell', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const tagsCell = row.getByRole('cell').nth(6);

  // Select "Backend" first so this test is self-contained and doesn't depend on state left
  // behind by the "can select an additional option" test (which would break on a retry after a
  // prior attempt already removed it, or when run in isolation).
  await tagsCell.getByTestId('multi-select-cell-target').click();
  await page.getByRole('option', { name: tagsColumn.options[1].label }).click();
  await page.keyboard.press('Escape');
  await expect(tagsCell.getByText(tagsColumn.options[1].label)).toBeVisible();

  // Remove the "Backend" pill via its own close button. Scope to the target's descendant
  // buttons first — the target `div` itself has `role="button"` and, with no explicit label,
  // its accessible name is computed from its pill/close-button descendants, so an unscoped
  // `getByRole('button', { name })` on the cell would also match it.
  await tagsCell
    .getByTestId('multi-select-cell-target')
    .getByRole('button', { name: `Remove ${tagsColumn.options[1].label}` })
    .click();

  await expect(tagsCell.getByText(tagsColumn.options[1].label)).not.toBeVisible();
  await expect(tagsCell.getByText(tagsColumn.options[0].label)).toBeVisible();
  await expect(tagsCell.getByText(tagsColumn.options[2].label)).toBeVisible();
});

test('can create a new option from the multi-select cell dropdown and re-searching is idempotent', async ({
  page,
}) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const tagsCell = row.getByRole('cell').nth(6);

  await tagsCell.getByTestId('multi-select-cell-target').click();
  const searchInput = page.locator('input[placeholder="Search or create option"][data-expanded="true"]');
  await searchInput.fill('Design');
  await page.getByRole('option', { name: `+ Create "Design"` }).click();

  await expect(tagsCell.getByText('Design')).toBeVisible();

  // Searching for the label just created (in a different case) should offer the existing
  // option rather than a second "+ Create" action, verifying the case-insensitive idempotency
  // of the shared create endpoint.
  await searchInput.fill('design');
  await expect(page.getByRole('option', { name: 'Design' })).toBeVisible();
  await expect(page.getByRole('option', { name: '+ Create "design"' })).toHaveCount(0);
});

test('can create a multi-select column with options via the Add Column modal', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: 'Add Column' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Column Name').fill('Labels');
  await page.getByRole('combobox', { name: 'Column Type' }).click();
  await page.getByRole('option', { name: 'Multi select' }).click();

  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByPlaceholder('Option label').first().fill('Bug');

  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByPlaceholder('Option label').nth(1).fill('Feature');

  await page.getByRole('button', { name: 'Create Column' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Labels' })).toBeVisible();

  // Verify the initially configured options actually persisted through column creation rather
  // than being discarded — reload and check both options are offered in the new cell's dropdown.
  await page.reload();
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const labelsCell = row.getByRole('cell').nth(-2);
  await labelsCell.getByTestId('multi-select-cell-target').click();
  await expect(page.getByRole('option', { name: 'Bug' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Feature' })).toBeVisible();
});

test('can create a multi-select column with zero options and add options inline from the table', async ({
  page,
}) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: 'Add Column' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Column Name').fill('Empty Tags');
  await page.getByRole('combobox', { name: 'Column Type' }).click();
  await page.getByRole('option', { name: 'Multi select' }).click();

  // No option label input is required to create the column.
  await expect(page.getByPlaceholder('Option label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create Column' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Empty Tags' })).toBeVisible();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const emptyTagsCell = row.getByRole('cell').nth(-2);

  await emptyTagsCell.getByTestId('multi-select-cell-target').click();
  // Multiple multi-select cells stay mounted in the DOM even when their dropdown is closed —
  // scope to the one currently expanded to avoid a strict-mode violation on the shared
  // "Search or create option" placeholder.
  const searchInput = page.locator('input[placeholder="Search or create option"][data-expanded="true"]');
  await searchInput.fill('Archived');
  await page.getByRole('option', { name: `+ Create "Archived"` }).click();

  await expect(emptyTagsCell.getByText('Archived')).toBeVisible();
});
