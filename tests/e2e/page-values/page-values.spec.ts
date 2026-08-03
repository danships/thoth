import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import type { Page, Locator } from '@playwright/test';

async function openDataView(page: Page) {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
}

// Locates a data-view row by its page name (shown in the row's editable name cell, distinct from
// the row's separate "OPEN" link), then returns that row's "Notes" cell (the first data column,
// per `SEED.dataSource`).
function noteCellForRow(page: Page, rowName: string) {
  const row = page.getByRole('row').filter({ hasText: rowName });
  return row.getByRole('cell').nth(1);
}

// Enters edit mode via the labelled edit control (the accessible `role="button"` target
// `MarkdownTextCell` renders at rest) rather than a raw coordinate click — more robust than
// clicking the enclosing `<td>`, since the clickable target is only as wide as its content.
async function openCellEditor(cell: Locator) {
  await cell.getByRole('button').click();
  const editor = cell.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  return editor;
}

async function restoreMarkdownRow(page: Page, value: string) {
  await page.request.patch(`/api/v1/pages/${SEED.dataSource.markdownRow.id}/values`, {
    data: { [SEED.dataSource.columns[0].id]: { type: 'string', value } },
  });
}

test('seeded text cell value is visible in the data view table', async ({ page }) => {
  await openDataView(page);
  await expect(page.getByText('Seeded note')).toBeVisible();
});

test('boolean cell renders in the data view table', async ({ page }) => {
  await openDataView(page);
  await expect(page.getByRole('checkbox').first()).toBeVisible();
});

test('can edit a text cell value inline', async ({ page }) => {
  await openDataView(page);

  const noteCell = noteCellForRow(page, SEED.dataSourcePage.name);

  // Clicking the rendered (Markdown) cell's edit control activates edit mode, swapping in the
  // raw-text editor.
  const editor = await openCellEditor(noteCell);
  await editor.press('ControlOrMeta+A');
  await editor.pressSequentially('Updated note');

  const savedResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/pages/${SEED.dataSourcePage.id}/values`) && response.request().method() === 'PATCH'
  );
  await editor.press('Enter');
  await savedResponse;

  // Committing returns the cell to its (Markdown) display state.
  await expect(noteCell.locator('[contenteditable="true"]')).toHaveCount(0);
  await expect(noteCell).toHaveText('Updated note');

  await page.reload();
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByText('Updated note')).toBeVisible({ timeout: 10_000 });
});

test.describe('THOTH-053: inline Markdown rendering', () => {
  test.afterEach(async ({ page }) => {
    // Every test in this block may mutate `SEED.dataSource.markdownRow`'s Notes value — always
    // restore it afterwards (even on assertion failure) so later tests, and later runs that reuse
    // the same seeded database, see the expected fixture text.
    await restoreMarkdownRow(page, SEED.dataSource.markdown.raw);
  });

  test('emphasis, inline code, strikethrough, and links render inline', async ({ page }) => {
    await openDataView(page);
    const markdown = SEED.dataSource.markdown;
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);

    await expect(cell.locator('strong', { hasText: markdown.boldText })).toBeVisible();
    await expect(cell.locator('em', { hasText: markdown.emphasisText })).toBeVisible();
    await expect(cell.locator('del', { hasText: markdown.strikeText })).toBeVisible();
    await expect(cell.locator('code', { hasText: markdown.codeText })).toBeVisible();

    const link = cell.getByRole('link', { name: markdown.linkText });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', markdown.linkHref);
  });

  test('clicking a rendered link does not enter edit mode', async ({ page }) => {
    await openDataView(page);
    const markdown = SEED.dataSource.markdown;
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);
    const link = cell.getByRole('link', { name: markdown.linkText });

    await link.click();
    await expect(cell.locator('[contenteditable="true"]')).toHaveCount(0);
  });

  test('activating edit mode reveals the exact raw Markdown source', async ({ page }) => {
    await openDataView(page);
    const markdown = SEED.dataSource.markdown;
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);

    const editor = await openCellEditor(cell);
    await expect(editor).toHaveText(markdown.raw);

    // Escape cancels back to the display state without altering the value.
    await editor.press('Escape');
    await expect(cell.locator('[contenteditable="true"]')).toHaveCount(0);
    await expect(cell.locator('strong', { hasText: markdown.boldText })).toBeVisible();
  });

  test('Enter, Shift+Enter, and Ctrl/Cmd+Enter all commit without inserting a newline', async ({ page }) => {
    await openDataView(page);
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);

    for (const keys of ['Enter', 'Shift+Enter', 'ControlOrMeta+Enter']) {
      const editor = await openCellEditor(cell);
      await editor.press(keys);
      await expect(cell.locator('[contenteditable="true"]'), `editor should close for ${keys}`).toHaveCount(0);
    }
  });

  test('pasting multiline plain text collapses it to one line', async ({ page }) => {
    await openDataView(page);
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);

    const editor = await openCellEditor(cell);
    await editor.press('ControlOrMeta+A');

    await page.evaluate(() => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', 'line one\nline two\r\nline three');
      document.activeElement?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true })
      );
    });

    await expect(editor).toHaveText('line one line two line three');
    await editor.press('Escape');
  });

  test('empty value renders an empty but usable cell target', async ({ page }) => {
    await restoreMarkdownRow(page, '');

    await openDataView(page);
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);
    const editor = await openCellEditor(cell);
    await editor.press('Escape');
  });

  test('unchanged blur does not issue a redundant save', async ({ page }) => {
    await openDataView(page);
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);
    const markdown = SEED.dataSource.markdown;

    let patchCount = 0;
    await page.route(`**/api/v1/pages/${SEED.dataSource.markdownRow.id}/values`, async (route) => {
      patchCount += 1;
      await route.continue();
    });

    const editor = await openCellEditor(cell);
    await editor.press('Enter');
    await expect(cell.locator('[contenteditable="true"]')).toHaveCount(0);
    await expect(cell.locator('strong', { hasText: markdown.boldText })).toBeVisible();

    expect(patchCount).toBe(0);
  });

  test('a number cell remains plain and unaffected by Markdown rendering', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.filterSort.host.id}`);
    await page.getByRole('tab', { name: SEED.filterSort.dataView.name }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Score is a number column — it must never be interpreted as Markdown.
    const scoreCell = page.getByRole('cell').filter({ hasText: /^\d+$/ }).first();
    await expect(scoreCell).toBeVisible();
    await expect(scoreCell.locator('strong, em, del, a')).toHaveCount(0);
  });

  test('raw HTML and unsafe URL schemes are neutralised, not executed', async ({ page }) => {
    const hostileValue =
      '<img src=x onerror="window.__xss=true"> <script>window.__xss=true</script> ' +
      '[click me](javascript:window.__xss=true) [data link](data:text/html,evil)';

    await restoreMarkdownRow(page, hostileValue);

    await openDataView(page);
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);
    await expect(cell).toBeVisible();

    // The injected script/handler never executed.
    const executed = await page.evaluate(() => (globalThis as unknown as { __xss?: boolean }).__xss);
    expect(executed).toBeUndefined();

    // No <script>/<img>/<iframe> element was mounted into the DOM from this cell's content.
    await expect(cell.locator('script, img, iframe')).toHaveCount(0);

    // Rejected-scheme links must not be rendered as actionable anchors.
    const unsafeLinks = await cell
      .locator('a')
      .evaluateAll((anchors) =>
        anchors
          .map((a) => a.getAttribute('href'))
          .filter(
            (href): href is string => href !== null && (href.startsWith('javascript:') || href.startsWith('data:'))
          )
      );
    expect(unsafeLinks).toHaveLength(0);
  });

  test('a read-only member can see rendered Markdown in the data view', async ({ browser }) => {
    // Sign in as `SEED.thirdUser` (seeded with read-only access to `SEED.workspace`) in a fresh,
    // isolated browser context so this doesn't disturb the primary user's session used by every
    // other test in this file. Read-only members can still open the raw-source editor client
    // side (write enforcement happens server-side on save) — this test only verifies the
    // rendered Markdown itself is visible to them.
    const context = await browser.newContext();
    const signInResponse = await context.request.post('/api/auth/sign-in/email', {
      data: { email: SEED.thirdUser.email, password: SEED.thirdUser.password },
    });
    expect(signInResponse.ok()).toBe(true);

    const page = await context.newPage();
    await openDataView(page);

    const markdown = SEED.dataSource.markdown;
    const cell = noteCellForRow(page, SEED.dataSource.markdownRow.name);
    await expect(cell.locator('strong', { hasText: markdown.boldText })).toBeVisible();

    await context.close();
  });
});
