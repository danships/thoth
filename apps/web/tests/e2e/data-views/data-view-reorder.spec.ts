import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import { dragHandleOnto } from '../utils/drag-and-drop';
import type { Page } from '@playwright/test';

// THOTH-036: manual drag-and-drop reordering of rows in a Data View. Uses the dedicated
// `SEED.filterSort` fixture (8 named rows, its own host page/view) so reordering never
// interferes with `SEED.dataSource`'s single-row fixture used by other data-view specs.

async function openFilterSortView(page: Page) {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.filterSort.host.id}`);
  await page.getByRole('tab', { name: SEED.filterSort.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
}

// Returns the seeded row names present in the table, in visual top-to-bottom order — derived by
// reading each row's accessible name (which starts with the page name, e.g. "Apple OPEN ...") and
// matching it against the known `SEED.filterSort.rows` names, rather than assuming an exact cell
// text (the Name cell also contains a hover "Open" action).
async function visibleRowOrder(page: Page): Promise<string[]> {
  const rows = page.locator('tbody tr').filter({ has: page.locator('[data-testid^="drag-handle-"]') });
  const names = await rows.evaluateAll(
    (trs, knownNames: string[]) =>
      trs.map((tr) => knownNames.find((name) => (tr.textContent ?? '').includes(name)) ?? ''),
    SEED.filterSort.rows.map((row) => row.name)
  );
  return names;
}

test.describe('Data View drag-and-drop reordering', () => {
  test.afterEach(async ({ page }) => {
    // Reset the view's filters/sorts back to a clean state (mirrors `filter-sort.spec.ts`) so
    // other specs relying on `SEED.filterSort` aren't affected by a leftover custom sort. Row
    // order itself isn't reset — none of the other `filterSort` specs assert a specific manual
    // (`sortOrder`) order; they either apply their own explicit sort or filter and assert
    // against known row names, not position.
    await page.request.patch(`/api/v1/views/${SEED.filterSort.dataView.id}`, {
      data: { filters: [], sorts: [] },
    });
  });

  test('dragging a row above another persists the new order across reload', async ({ page }) => {
    await openFilterSortView(page);

    const before = await visibleRowOrder(page);
    expect(before.length).toBeGreaterThan(1);
    const [firstName, secondName] = before;

    // Drag the second row's handle onto the first row, moving it to the top.
    const secondRow = SEED.filterSort.rows.find((row) => row.name === secondName);
    if (!secondRow) throw new Error('row not found');
    const handle = page.getByTestId(`drag-handle-${secondRow.id}`);
    const targetHandle = page.getByTestId(
      `drag-handle-${SEED.filterSort.rows.find((row) => row.name === firstName)?.id}`
    );
    const reorderResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/pages/${secondRow.id}/reorder`) && response.request().method() === 'POST'
    );
    await dragHandleOnto(page, handle, targetHandle);
    await reorderResponse;

    await expect(async () => {
      const after = await visibleRowOrder(page);
      expect(after[0]).toBe(secondName);
      expect(after[1]).toBe(firstName);
    }).toPass({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
    const afterReload = await visibleRowOrder(page);
    expect(afterReload[0]).toBe(secondName);
    expect(afterReload[1]).toBe(firstName);
  });

  test('dragging a row while a custom sort is active prompts to remove the sort', async ({ page }) => {
    await openFilterSortView(page);

    await page.getByTestId('filter-sort-bar-sort-button').click();
    await page.getByRole('button', { name: 'Add sort' }).click();
    const sortRow = page.getByTestId('sort-rule-row').first();
    await sortRow.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'Score', exact: true }).click();
    await page.getByTestId('apply-sorts').click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Use two rows with unique, unambiguous scores (-5 and 0 — the two lowest of the fixture)
    // rather than reading the sorted table and looking the names back up, so the test doesn't
    // depend on how ties/nulls are ordered.
    const grape = SEED.filterSort.rows.find((row) => row.name === 'grape')!;
    const fig = SEED.filterSort.rows.find((row) => row.name === 'Fig')!;

    await expect(async () => {
      const order = await visibleRowOrder(page);
      expect(order.indexOf('grape')).toBeLessThan(order.indexOf('Fig'));
    }).toPass({ timeout: 10_000 });

    const modal = page.getByRole('dialog', { name: 'Custom sort applied' });
    const before = await visibleRowOrder(page);

    await dragHandleOnto(page, page.getByTestId(`drag-handle-${fig.id}`), page.getByTestId(`drag-handle-${grape.id}`));
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Cancel: order and sort configuration are both left untouched.
    await modal.getByRole('button', { name: 'Keep sort' }).click();
    await expect(modal).not.toBeVisible();
    const afterCancel = await visibleRowOrder(page);
    expect(afterCancel).toEqual(before);

    // Confirm this time: the sort is cleared and the pending reorder is applied.
    await dragHandleOnto(page, page.getByTestId(`drag-handle-${fig.id}`), page.getByTestId(`drag-handle-${grape.id}`));
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Remove sort & reorder' }).click();
    await expect(modal).not.toBeVisible();

    // The sort is cleared once confirmed.
    await expect(page.getByTestId('filter-sort-bar-sort-button')).toHaveText('Sort', { timeout: 10_000 });

    // The pending reorder is applied against the freshly-revalidated manual order: the dragged
    // row (`Fig`) and its drop target (`grape`) end up adjacent to one another (exact relative
    // direction depends on where the two rows already sat in the manual order once the sort was
    // cleared, which is independent of their Score-sorted positions used to pick them).
    await expect(async () => {
      const after = await visibleRowOrder(page);
      const grapeIndex = after.indexOf('grape');
      const figIndex = after.indexOf('Fig');
      expect(grapeIndex).toBeGreaterThan(-1);
      expect(figIndex).toBeGreaterThan(-1);
      expect(Math.abs(grapeIndex - figIndex)).toBe(1);
    }).toPass({ timeout: 10_000 });
  });
});
