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
    expect(current.ok()).toBe(true);
    const currentBody = await current.json();
    const restore = await page.request.patch(`/api/v1/views/${SEED.columnLayout.dataView.id}`, {
      data: {
        columnLayout: [...SEED.columnLayout.layout],
        expectedLastUpdated: currentBody.data.lastUpdated,
      },
    });
    expect(restore.ok()).toBe(true);
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

    // Retry the whole pick-up/move/drop keyboard sequence, not just the resulting assertion.
    // dnd-kit's KeyboardSensor computes the drop target from the *currently measured* droppable
    // rects, which are recalculated asynchronously (e.g. on scroll/resize observers) — under CI
    // load, the very first `ArrowRight` can occasionally be evaluated against stale rects and
    // resolve to a no-op move, landing the column right back where it started. Waiting only on
    // `aria-pressed` (confirming pick-up) isn't sufficient to guard against that, so if the
    // header order hasn't actually changed after a full press/move/drop cycle, redo the entire
    // sequence — a fresh `focus()` + `Space` starts a brand-new drag with freshly measured rects.
    await expect(async () => {
      // If a previous iteration's `ArrowRight` did land (just not yet reflected when we last
      // checked), the order may already be correct — skip re-issuing the keyboard sequence in
      // that case, since doing so would pick Alpha back up and move it a second time.
      const headers = headerOrder(page);
      const currentOrder = await headers.allTextContents();
      if (
        currentOrder[0]?.includes('Name') &&
        currentOrder[1]?.includes('Alpha') &&
        currentOrder[2]?.includes('Beta')
      ) {
        return;
      }

      await alphaHandle.focus();
      await page.keyboard.press('Space');
      // dnd-kit's KeyboardSensor flips `aria-pressed` on the draggable handle once the drag has
      // actually been picked up (its internal state updates asynchronously). Without waiting for
      // it, the following ArrowRight can race ahead of pickup under load and be dropped/ignored,
      // making this test flaky (THOTH-052 CI failures).
      await expect(alphaHandle).toHaveAttribute('aria-pressed', 'true');
      // Even after pickup is confirmed, dnd-kit's droppable rects are (re-)measured
      // asynchronously (ResizeObserver/scroll listeners). Under CI load the very next
      // `ArrowRight` can still be evaluated against stale rects and resolve to a no-op move.
      // Give the measurement a moment to settle before issuing the move, on top of the
      // outer `toPass` retry which redoes the whole sequence if this still races.
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');

      await expect(headers.nth(0)).toContainText('Name');
      await expect(headers.nth(1)).toContainText('Alpha');
      await expect(headers.nth(2)).toContainText('Beta');
    }).toPass({ timeout: 30_000 });
  });

  test('Columns manager: show Gamma and apply persists it visibly at its stored position', async ({ page }) => {
    await openColumnLayoutView(page);

    await page.getByTestId('open-column-manager').click();
    const gammaId = SEED.columnLayout.dataSource.columns[2]!.id;
    await page.getByTestId(`column-manager-visible-${gammaId}`).click();
    const [patchResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/views/${SEED.columnLayout.dataView.id}`) &&
          response.request().method() === 'PATCH'
      ),
      page.getByTestId('column-manager-apply').click(),
    ]);
    expect(patchResponse.ok()).toBe(true);

    await expect(page.getByTestId('open-column-manager')).toBeVisible();
    await expect(async () => {
      const headers = headerOrder(page);
      await expect(headers).toHaveCount(4);
      await expect(page.getByRole('columnheader', { name: /Gamma/ })).toBeVisible();
    }).toPass({ timeout: 10_000 });

    // Reload to confirm the applied layout was actually persisted, not just reflected optimistically.
    await page.reload();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    const headers = headerOrder(page);
    await expect(headers).toHaveCount(4);
    await expect(headers.nth(0)).toContainText('Alpha');
    await expect(headers.nth(1)).toContainText('Name');
    await expect(headers.nth(2)).toContainText('Beta');
    await expect(headers.nth(3)).toContainText('Gamma');
  });

  test('Columns manager: Reset to default restores Name-first, all-visible order', async ({ page }) => {
    await openColumnLayoutView(page);

    await page.getByTestId('open-column-manager').click();
    await page.getByRole('button', { name: 'Reset to default' }).click();
    const [patchResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/views/${SEED.columnLayout.dataView.id}`) &&
          response.request().method() === 'PATCH'
      ),
      page.getByTestId('column-manager-apply').click(),
    ]);
    expect(patchResponse.ok()).toBe(true);

    await expect(async () => {
      const headers = headerOrder(page);
      await expect(headers).toHaveCount(4);
      await expect(headers.nth(0)).toContainText('Name');
      await expect(headers.nth(1)).toContainText('Alpha');
      await expect(headers.nth(2)).toContainText('Beta');
      await expect(headers.nth(3)).toContainText('Gamma');
    }).toPass({ timeout: 10_000 });

    // Reload to confirm the applied layout was actually persisted, not just reflected optimistically.
    await page.reload();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    const headers = headerOrder(page);
    await expect(headers).toHaveCount(4);
    await expect(headers.nth(0)).toContainText('Name');
    await expect(headers.nth(1)).toContainText('Alpha');
    await expect(headers.nth(2)).toContainText('Beta');
    await expect(headers.nth(3)).toContainText('Gamma');
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
    expect(current.ok()).toBe(true);
    const currentBody = await current.json();
    const conflictingUpdate = await page.request.patch(`/api/v1/views/${SEED.columnLayout.dataView.id}`, {
      data: {
        columnLayout: [...SEED.columnLayout.layout],
        expectedLastUpdated: currentBody.data.lastUpdated,
      },
    });
    expect(conflictingUpdate.ok()).toBe(true);

    const betaHandle = page.getByTestId(`column-drag-handle-${SEED.columnLayout.dataSource.columns[1]!.id}`);
    const nameHeader = page.getByTestId('column-header-name');
    await dragHandleOnto(page, betaHandle, nameHeader);

    await expect(
      page.getByText('This view changed elsewhere since it was loaded. The column layout has been refreshed.')
    ).toBeVisible({
      timeout: 10_000,
    });

    // The stale drag must be reverted to the (now current) persisted layout, not left applied.
    const headers = headerOrder(page);
    await expect(headers.nth(0)).toContainText('Alpha');
    await expect(headers.nth(1)).toContainText('Name');
    await expect(headers.nth(2)).toContainText('Beta');
  });
});
