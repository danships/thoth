import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import type { Page, Locator } from '@playwright/test';

// THOTH-037: filtering/sorting configuration on a Data View. Uses the dedicated
// `SEED.filterSort` fixture (a data source with `Label`/`Score` columns and 4 rows, one of
// which — "Date" — deliberately has no `Score` value) so assertions are self-contained and
// don't interfere with `SEED.dataSource`'s single-row fixture used by other specs.

async function openFilterSortView(page: Page) {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.filterSort.host.id}`);
  await page.getByRole('tab', { name: SEED.filterSort.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
}

// The page-name cell is a `contentEditable` element and re-renders don't remove stale nodes
// instantly, so `getByText(exact)` can match more than one node transiently. Assert row
// presence/absence via count rather than a single-locator `toBeVisible()`/`not.toBeVisible()`.
async function expectRowVisible(page: Page, name: string) {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
}

async function expectRowAbsent(page: Page, name: string) {
  await expect(page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 10_000 });
}

// Mantine's `Select` renders an ARIA `combobox`, not a `textbox` — the filter/sort row's plain
// value `TextInput` is the only `textbox`. `nth(0)`/`nth(1)` below are column/operator pickers.
function comboboxes(row: Locator) {
  return row.getByRole('combobox');
}

test.describe('Data View filter/sort configuration', () => {
  test.afterEach(async ({ page }) => {
    // Every test seeds `SEED.filterSort.dataView` with empty filters/sorts (see
    // `scripts/end-to-end-seed.ts`) but mutates it in place via the UI — reset back to the
    // clean state so tests remain order-independent across runs.
    await page.request.patch(`/api/v1/views/${SEED.filterSort.dataView.id}`, {
      data: { filters: [], sorts: [] },
    });
  });

  test('setting a contains filter on a string column shows only matching rows', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-filter-button').click();
    await page.getByRole('button', { name: 'Add filter' }).click();

    const filterRow = page.getByTestId('filter-rule-row').first();
    await expect(filterRow).toBeVisible();

    // Column defaults to "Label" (first column); operator defaults to "is" — switch to "contains".
    await comboboxes(filterRow).nth(1).click();
    await page.getByRole('option', { name: 'contains', exact: true }).click();
    await filterRow.getByPlaceholder('Value').fill('an');

    await page.getByTestId('apply-filters').click();

    await expectRowVisible(page, 'Banana');
    await expectRowAbsent(page, 'Apple');
    await expectRowAbsent(page, 'cherry');
    await expectRowAbsent(page, 'Date');
  });

  test('setting a gt filter on a number column shows only rows above the threshold', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-filter-button').click();
    await page.getByRole('button', { name: 'Add filter' }).click();

    const filterRow = page.getByTestId('filter-rule-row').first();
    // Switch the column to "Score".
    await comboboxes(filterRow).nth(0).click();
    await page.getByRole('option', { name: 'Score', exact: true }).click();
    // Selecting a new column re-renders the value input (TextInput -> NumberInput), which can
    // briefly reposition the still-mounted operator dropdown mid-click if opened immediately —
    // wait for that re-render to settle first.
    await expect(comboboxes(filterRow).nth(1)).toBeVisible();
    // Switch operator to ">".
    await comboboxes(filterRow).nth(1).click();
    await page.getByRole('option', { name: '>', exact: true }).click();
    await filterRow.getByRole('textbox').fill('15');

    await page.getByTestId('apply-filters').click();

    await expectRowVisible(page, 'Banana');
    await expectRowVisible(page, 'cherry');
    await expectRowAbsent(page, 'Apple');
    await expectRowAbsent(page, 'Date');
  });

  test('an empty-result filter shows an empty table, not an error', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-filter-button').click();
    await page.getByRole('button', { name: 'Add filter' }).click();

    const filterRow = page.getByTestId('filter-rule-row').first();
    await filterRow.getByPlaceholder('Value').fill('this-value-matches-nothing');

    await page.getByTestId('apply-filters').click();

    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    for (const row of SEED.filterSort.rows) {
      await expectRowAbsent(page, row.name);
    }
  });

  test('setting a sort by Score descending orders rows accordingly', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-sort-button').click();
    await page.getByRole('button', { name: 'Add sort' }).click();

    const sortRow = page.getByTestId('sort-rule-row').first();
    await comboboxes(sortRow).nth(0).click();
    await page.getByRole('option', { name: 'Score', exact: true }).click();
    await comboboxes(sortRow).nth(1).click();
    await page.getByRole('option', { name: 'Descending', exact: true }).click();

    await page.getByTestId('apply-sorts').click();

    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    const nameCells = page.getByRole('row').filter({ hasText: /Apple|Banana|cherry/ });
    await expect(nameCells).toHaveCount(3, { timeout: 10_000 });
    // Descending by Score: Banana (30), cherry (20), Apple (10). "Date" (no Score) sorts last.
    await expect(nameCells.nth(0)).toContainText('Banana');
    await expect(nameCells.nth(1)).toContainText('cherry');
    await expect(nameCells.nth(2)).toContainText('Apple');
  });

  test('sorting by Name orders rows alphabetically, case-insensitively (THOTH-065)', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-sort-button').click();
    await page.getByRole('button', { name: 'Add sort' }).click();

    const sortRow = page.getByTestId('sort-rule-row').first();
    // Column defaults to "Name" (listed first, always sortable — THOTH-065); direction defaults
    // to "Ascending".
    await expect(comboboxes(sortRow).nth(0)).toHaveValue('Name');

    await page.getByTestId('apply-sorts').click();

    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    const nameCells = page.getByRole('row').filter({ hasText: /Apple|Banana|cherry|Date/ });
    await expect(nameCells).toHaveCount(4, { timeout: 10_000 });
    // Ascending, case-insensitive: Apple, Banana, cherry, Date.
    await expect(nameCells.nth(0)).toContainText('Apple');
    await expect(nameCells.nth(1)).toContainText('Banana');
    await expect(nameCells.nth(2)).toContainText('cherry');
    await expect(nameCells.nth(3)).toContainText('Date');
  });

  test('filter/sort config persists across a page reload', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-filter-button').click();
    await page.getByRole('button', { name: 'Add filter' }).click();
    const filterRow = page.getByTestId('filter-rule-row').first();
    await comboboxes(filterRow).nth(1).click();
    await page.getByRole('option', { name: 'contains', exact: true }).click();
    await filterRow.getByPlaceholder('Value').fill('an');
    await page.getByTestId('apply-filters').click();

    await expectRowVisible(page, 'Banana');

    await page.reload();
    await expect(page.getByRole('tab', { name: SEED.filterSort.dataView.name, selected: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    await expectRowVisible(page, 'Banana');
    await expectRowAbsent(page, 'Apple');
  });
});
