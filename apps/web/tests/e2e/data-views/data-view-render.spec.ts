import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test('seeded data view tab renders the DataViewTable', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
});

test('seeded data row appears in the data view table', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByText(SEED.dataSourcePage.name)).toBeVisible();
});

test('inline Markdown in a text cell does not break the row/column structure', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

  const row = page.getByRole('row').filter({ hasText: SEED.dataSource.markdownRow.name });
  await expect(row).toBeVisible();

  // Compare against the live header cell count (rather than a hardcoded `columns.length + 1`)
  // so this assertion stays robust if another spec run earlier in the suite added a column to
  // this shared data source: the Markdown row must still have exactly one cell per column, and
  // its rendered Markdown content sits inside that single "Notes" cell rather than spilling into
  // neighbouring cells or adding extra rows. Cell 0 is the THOTH-036 drag-handle column, cell 1
  // is "Name", so "Notes" is cell 2.
  const headerCellCount = await page.getByRole('row').first().getByRole('columnheader').count();
  await expect(row.getByRole('cell')).toHaveCount(headerCellCount);
  const notesCell = row.getByRole('cell').nth(2);
  await expect(notesCell.locator('strong', { hasText: SEED.dataSource.markdown.boldText })).toBeVisible();
});

test('can create a new page from the "New page name" row using the Add page button', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

  const pageName = `E2E New Page ${Date.now()}`;
  await page.getByPlaceholder('New page name').fill(pageName);
  await page.getByRole('button', { name: 'Add page' }).click();

  await expect(page.getByText(pageName)).toBeVisible({ timeout: 10_000 });
});

test.describe('on mobile viewports', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Add page button is available and creates a page when Enter is not usable', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
    await page.getByRole('tab', { name: SEED.dataView.name }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    const pageName = `E2E Mobile New Page ${Date.now()}`;
    const input = page.getByPlaceholder('New page name');
    await input.fill(pageName);

    const addButton = page.getByRole('button', { name: 'Add page' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect(page.getByText(pageName)).toBeVisible({ timeout: 10_000 });
  });
});
