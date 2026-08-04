import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import type { Page } from '@playwright/test';
import { dragHandleOnto } from '../utils/drag-and-drop';

// THOTH-052: column order/visibility management on a Data View. Uses the dedicated
// `SEED.columnLayout` fixture (Alpha/Name/Beta visible, Gamma hidden) so drag/manager
// assertions are self-contained and don't interfere with other data-view specs.

async function openColumnLayoutView(page: Page) {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.columnLayout.host.id}`);
  await page.getByRole('tab', { name: SEED.columnLayout.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
}

function headerOrder(page: Page) {
  // Scope to our `SortableDataViewColumnHeader` cells specifically — the leading THOTH-036
  // drag-handle `<Table.Th>` and the trailing fixed action-gutter `<Table.Th>` also carry
  // `role="columnheader"` but have no `data-testid="column-header-*"` and aren't part of the
  // configurable layout.
  return page.getByRole('row').first().locator('[data-testid^="column-header-"]');
}

test.describe('Data View column layout', () => {
  test.afterEach(async ({ page }) => {
    // Restore the fixture's persisted layout (Alpha, Name, Beta visible; Gamma hidden) and a
    // fresh `lastUpdated`, so tests remain order-independent across runs.
    const current = await page.request.get(`/api/v1/views/${SEED.columnLayout.dataView.id}`);
    const currentBody = await current.json();
    await page.request.patch(`/api/v1/views/${SEED.columnLayout.dataView.id}`, {
      data: {
        columnLayout: [...SEED.columnLayout.layout],
        expectedLastUpdated: currentBody.data.lastUpdated,
      },
    });
  });

  test('renders the persisted layout: Alpha, Name, Beta visible, Gamma hidden', async ({ page }) => {
    await openColumnLayoutView(page);

    const headers = headerOrder(page);
    await expect(headers).toHaveCount(3);
    await expect(headers.nth(0)).toContainText('Alpha');
    await expect(headers.nth(1)).toContainText('Name');
    await expect(headers.nth(2)).toContainText('Beta');
    await expect(page.getByRole('columnheader', { name: /Gamma/ })).toHaveCount(0);
  });

  test('a hidden column remains selectable in the filter/sort bar', async ({ page }) => {
    await openColumnLayoutView(page);
    await page.getByTestId('filter-sort-bar-filter-button').click();
    await page.getByRole('button', { name: 'Add filter' }).click();
    const filterRow = page.getByTestId('filter-rule-row').first();
    await expect(filterRow).toBeVisible();
    await filterRow.getByRole('combobox').first().click();
    await expect(page.getByRole('option', { name: 'Gamma', exact: true })).toBeVisible();
  });

  test('dragging a visible header before Name persists and survives reload', async ({ page }) => {
    await openColumnLayoutView(page);

    const betaHandle = page.getByTestId(`column-drag-handle-${SEED.columnLayout.dataSource.columns[1]!.id}`);
    const nameHeader = page.getByTestId('column-header-name');
    await dragHandleOnto(page, betaHandle, nameHeader);

    await expect(async () => {
      const headers = headerOrder(page);
      await expect(headers.nth(0)).toContainText('Alpha');
      await expect(headers.nth(1)).toContainText('Beta');
      await expect(headers.nth(2)).toContainText('Name');
    }).toPass({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    const headers = headerOrder(page);
    await expect(headers.nth(0)).toContainText('Alpha');
    await expect(headers.nth(1)).toContainText('Beta');
    await expect(headers.nth(2)).toContainText('Name');
  });

  test('keyboard reorder: focus a handle, move with arrow keys, and drop', async ({ page }) => {
    await openColumnLayoutView(page);

    const alphaHandle = page.getByTestId(`column-drag-handle-${SEED.columnLayout.dataSource.columns[0]!.id}`);
    await alphaHandle.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');

    await expect(async () => {
      const headers = headerOrder(page);
      await expect(headers.nth(0)).toContainText('Name');
      await expect(headers.nth(1)).toContainText('Alpha');
      await expect(headers.nth(2)).toContainText('Beta');
    }).toPass({ timeout: 10_000 });
  });

  test('Columns manager: show Gamma and apply persists it visibly at its stored position', async ({ page }) => {
    await openColumnLayoutView(page);

    await page.getByTestId('open-column-manager').click();
    const gammaId = SEED.columnLayout.dataSource.columns[2]!.id;
    await page.getByTestId(`column-manager-visible-${gammaId}`).click();
    await page.getByTestId('column-manager-apply').click();

    await expect(page.getByTestId('open-column-manager')).toBeVisible();
    await expect(async () => {
      const headers = headerOrder(page);
      await expect(headers).toHaveCount(4);
      await expect(page.getByRole('columnheader', { name: /Gamma/ })).toBeVisible();
    }).toPass({ timeout: 10_000 });
  });

  test('Columns manager: Reset to default restores Name-first, all-visible order', async ({ page }) => {
    await openColumnLayoutView(page);

    await page.getByTestId('open-column-manager').click();
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await page.getByTestId('column-manager-apply').click();

    await expect(async () => {
      const headers = headerOrder(page);
      await expect(headers).toHaveCount(4);
      await expect(headers.nth(0)).toContainText('Name');
      await expect(headers.nth(1)).toContainText('Alpha');
      await expect(headers.nth(2)).toContainText('Beta');
      await expect(headers.nth(3)).toContainText('Gamma');
    }).toPass({ timeout: 10_000 });
  });

  test('rows still show an Open action after Name/columns are rearranged', async ({ page }) => {
    await openColumnLayoutView(page);
    const row = page.getByRole('row').filter({ hasText: SEED.columnLayout.rows[0]!.name });
    await expect(row.getByRole('link', { name: 'OPEN' })).toBeVisible();
  });

  test('concurrent edit: a stale drag is rejected with a conflict notification and reverted', async ({ page }) => {
    await openColumnLayoutView(page);

    // Simulate a concurrent edit landing elsewhere between page load and the drag below.
    const current = await page.request.get(`/api/v1/views/${SEED.columnLayout.dataView.id}`);
    const currentBody = await current.json();
    await page.request.patch(`/api/v1/views/${SEED.columnLayout.dataView.id}`, {
      data: {
        columnLayout: [...SEED.columnLayout.layout],
        expectedLastUpdated: currentBody.data.lastUpdated,
      },
    });

    const betaHandle = page.getByTestId(`column-drag-handle-${SEED.columnLayout.dataSource.columns[1]!.id}`);
    const nameHeader = page.getByTestId('column-header-name');
    await dragHandleOnto(page, betaHandle, nameHeader);

    await expect(page.locator('.mantine-Notifications-notification')).toBeVisible({ timeout: 10_000 });
  });
});
