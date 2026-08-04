import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// A minimal valid 1x1 transparent PNG — matches the pattern used in `files/image-embed.spec.ts`.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const fileColumn = SEED.dataSource.columns[5];

// NOTE: tests in this file run sequentially against a shared, seeded backend (see
// `playwright.config.ts`'s `workers: 1`) and operate on the seeded row's own "Attachment" cell
// (rather than creating new rows, which are prepended and would shift the `nth(...)` cell
// indices other specs in this directory rely on — see `multi-select-column.spec.ts`'s NOTE).
// The mutating test restores the seeded image attachment at the end so later tests/specs that
// depend on the seeded thumbnail keep working.

test('seeded file column header appears, and the seeded attachment renders as an inline thumbnail', async ({
  page,
}) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  await expect(page.getByRole('columnheader', { name: fileColumn.name })).toBeVisible();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const fileCell = row.getByRole('cell').nth(7);
  await expect(fileCell.getByTestId('file-cell-thumbnail')).toBeVisible();
});

test('can create a file column with no extra configuration via the Add Column modal', async ({ page }) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  await page.getByRole('button', { name: 'Add Column' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByLabel('Column Name').fill('Receipt');
  await page.getByRole('combobox', { name: 'Column Type' }).click();
  await page.getByRole('option', { name: 'File & media' }).click();

  // No options/config section (unlike single-/multi-select) is shown for a file column.
  await expect(page.getByPlaceholder('Option label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create Column' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Receipt' })).toBeVisible();
});

test('can remove the seeded attachment, upload a non-image file (chip) and an image (thumbnail), each persisting after reload', async ({
  page,
}) => {
  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.dataSourceHost.id}`);
  await page.getByRole('tab', { name: SEED.dataView.name }).click();

  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const fileCell = row.getByRole('cell').nth(7);
  await expect(fileCell.getByTestId('file-cell-thumbnail')).toBeVisible();

  // Remove the seeded attachment — the cell returns to its empty upload state and this persists
  // across reload.
  await fileCell.getByRole('button', { name: 'Remove file' }).click();
  await expect(fileCell.getByTestId('file-cell-upload')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  const rowAfterRemove = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const fileCellAfterRemove = rowAfterRemove.getByRole('cell').nth(7);
  await expect(fileCellAfterRemove.getByTestId('file-cell-upload')).toBeVisible();

  // Uploading a non-image renders a downloadable chip (filename + link), not an inline image.
  const uploadInputEmpty = fileCellAfterRemove.getByTestId('file-cell-input');
  const [nonImageUploadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/files') && response.ok()
    ),
    uploadInputEmpty.setInputFiles({
      name: 'e2e-file-column-doc.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('a small text attachment'),
    }),
  ]);
  expect(nonImageUploadResponse.ok()).toBe(true);

  const chip = fileCellAfterRemove.getByTestId('file-cell-chip');
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip.getByText('e2e-file-column-doc.txt')).toBeVisible();
  await expect(fileCellAfterRemove.getByTestId('file-cell-thumbnail')).toHaveCount(0);

  await page.reload();
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  const rowAfterDocumentUpload = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  const fileCellAfterDocumentUpload = rowAfterDocumentUpload.getByRole('cell').nth(7);
  await expect(fileCellAfterDocumentUpload.getByTestId('file-cell-chip')).toBeVisible();

  // Replace it with an image — restoring the seeded thumbnail state (used by the earlier test
  // and left in place for any spec that may run after this one) and verifying the inline
  // thumbnail path once more, including across a reload.
  await fileCellAfterDocumentUpload.getByRole('button', { name: 'Remove file' }).click();
  await expect(fileCellAfterDocumentUpload.getByTestId('file-cell-upload')).toBeVisible();

  const uploadInputForImage = fileCellAfterDocumentUpload.getByTestId('file-cell-input');
  const [imageUploadResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/files') && response.ok()
    ),
    uploadInputForImage.setInputFiles({
      name: 'e2e-restored-attachment.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    }),
  ]);
  expect(imageUploadResponse.ok()).toBe(true);
  await expect(fileCellAfterDocumentUpload.getByTestId('file-cell-thumbnail')).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByRole('tab', { name: SEED.dataView.name }).click();
  const rowAfterRestore = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'OPEN' }) });
  await expect(rowAfterRestore.getByRole('cell').nth(7).getByTestId('file-cell-thumbnail')).toBeVisible();
});
