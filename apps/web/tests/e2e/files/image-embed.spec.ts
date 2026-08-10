import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Drives the existing "Import from Markdown" page-menu action (a hidden native file input) to
// push a markdown string through the real editor pipeline (`replaceWithMarkdown` →
// `parseMarkdownToBlocks` → save), then reloads and re-asserts — this exercises the exact same
// (de)serialisation path a normal save/load cycle uses, without relying on typing/paste
// heuristics that don't reliably trigger BlockNote's markdown auto-conversion.
async function importMarkdown(page: Page, pageId: string, markdown: string) {
  await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
  await page.getByRole('button', { name: 'Page menu' }).click();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Import from Markdown' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'import.md', mimeType: 'text/markdown', buffer: Buffer.from(markdown) });

  // The page may already have content from other specs sharing the seeded database — confirm
  // the "replace content" prompt if it appears.
  const replaceButton = page.getByRole('button', { name: 'Replace' });
  if (
    await replaceButton.waitFor({ state: 'visible', timeout: 5000 }).then(
      () => true,
      () => false
    )
  ) {
    await replaceButton.click();
  }

  await expect(page.getByText('Imported markdown file')).toBeVisible({ timeout: 6000 });
}

test('uploaded image embeds inline and survives a reload', async ({ page }) => {
  const buffer = Buffer.from('E2E image bytes are not real PNG data, just a placeholder');
  const upload = await page.request.post('/api/v1/files', {
    multipart: {
      file: {
        name: 'e2e-inline-image.png',
        mimeType: 'image/png',
        buffer,
      },
      pageId: SEED.pages.child.id,
    },
  });
  expect(upload.ok()).toBe(true);
  const { data } = await upload.json();

  await importMarkdown(page, SEED.pages.child.id, `![e2e-inline-image](${data.url})`);

  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator(`.bn-editor img[src="${data.url}"]`)).toBeVisible({ timeout: 10_000 });

  // Reload: the markdown must round-trip back into the same inline `<img>`.
  await page.reload();
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator(`.bn-editor img[src="${data.url}"]`)).toBeVisible({ timeout: 10_000 });
});

test('a file block inserted via markdown import survives a reload (custom markdown persistence)', async ({ page }) => {
  // Exercises the custom `file`/`video`/`audio` markdown (de)serialisation (`markdown-blocks.ts`)
  // end-to-end through the real save/load pipeline (not just the unit-level round trip), by
  // importing a markdown document containing one of our stable HTML-comment file-block tokens.
  const markdown = [
    'Some text before the file block.',
    `<!--thoth-file-block:file:${JSON.stringify({ url: `/api/v1/files/${SEED.file.id}/content`, name: SEED.file.filename, caption: '' })}-->`,
    'Some text after the file block.',
  ].join('\n\n');

  await importMarkdown(page, SEED.pages.favoriteToggle.id, markdown);

  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator('.bn-editor').getByText(SEED.file.filename).first()).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(page.locator('.bn-editor').getByText(SEED.file.filename).first()).toBeVisible({ timeout: 10_000 });
});
