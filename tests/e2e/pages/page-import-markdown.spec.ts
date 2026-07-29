import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Covers THOTH-041: importing a local Markdown file into the page's content via the
// "Import from Markdown" action in the page detail menu. Everything is parsed client-side by
// BlockNote and persisted through the existing content-save endpoint, so these specs exercise
// the full menu -> file-picker -> editor -> save round-trip.
//
// Uses `SEED.pages.child`, which other specs (e.g. `page-detail.spec.ts`'s "edit round-trips
// after reload") also mutate, so content is explicitly reset to empty in `beforeEach` (not just
// relying on the seed) as well as `afterEach`, so this suite's assumptions about starting from an
// empty page hold regardless of execution order, and other specs aren't affected by leftover
// state from here either.
test.describe('page import from Markdown', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`/api/v1/pages/${SEED.pages.child.id}/content`, { data: { content: '' } });
  });

  test.afterEach(async ({ request }) => {
    await request.post(`/api/v1/pages/${SEED.pages.child.id}/content`, { data: { content: '' } });
  });

  test('imports a Markdown file into an empty page without a confirmation prompt', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
    await page.getByRole('tab', { name: 'Contents' }).click();
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Page menu' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Import from Markdown' }).click();
    const fileChooser = await fileChooserPromise;

    const [contentResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.child.id}/content`) && response.ok()
      ),
      fileChooser.setFiles({
        name: 'import.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# E2E Imported Heading\n\nSome imported paragraph.'),
      }),
    ]);
    expect(contentResponse.ok()).toBe(true);

    // No content existed yet, so the replace-confirmation modal should be skipped entirely.
    await expect(page.getByText('Replace page content?')).not.toBeVisible();

    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Imported Heading' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Imported markdown file')).toBeVisible({ timeout: 6000 });

    // Reload to confirm the import was actually persisted, not just reflected in local state.
    await page.reload();
    await page.getByRole('tab', { name: 'Contents' }).click();
    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Imported Heading' })).toBeVisible({ timeout: 10_000 });
  });

  test('prompts for confirmation before replacing existing content, and replaces it on confirm', async ({
    page,
    request,
  }) => {
    const setResponse = await request.post(`/api/v1/pages/${SEED.pages.child.id}/content`, {
      data: { content: '# E2E Existing Heading' },
    });
    expect(setResponse.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
    await page.getByRole('tab', { name: 'Contents' }).click();
    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Existing Heading' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Page menu' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Import from Markdown' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'import.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# E2E Replaced Heading'),
    });

    await expect(page.getByText('Replace page content?')).toBeVisible();
    await page.getByRole('button', { name: 'Replace' }).click();

    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Replaced Heading' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Imported markdown file')).toBeVisible({ timeout: 6000 });
  });

  test('cancelling the replace confirmation leaves existing content untouched', async ({ page, request }) => {
    const setResponse = await request.post(`/api/v1/pages/${SEED.pages.child.id}/content`, {
      data: { content: '# E2E Untouched Heading' },
    });
    expect(setResponse.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
    await page.getByRole('tab', { name: 'Contents' }).click();
    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Untouched Heading' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Page menu' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Import from Markdown' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'import.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# E2E Should Not Appear'),
    });

    await expect(page.getByText('Replace page content?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Untouched Heading' })).toBeVisible();
    await expect(page.locator('.bn-editor h1', { hasText: 'E2E Should Not Appear' })).not.toBeVisible();
  });

  test('rejects a file over the 1 MB import limit with an error, without saving', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
    await page.getByRole('tab', { name: 'Contents' }).click();
    await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Page menu' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Import from Markdown' }).click();
    const fileChooser = await fileChooserPromise;

    // One byte over the server's 1,000,000-character cap.
    const oversizedContent = 'a'.repeat(1_000_001);
    await fileChooser.setFiles({
      name: 'too-big.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(oversizedContent),
    });

    await expect(page.getByRole('alert').filter({ hasText: /too large/i })).toBeVisible({ timeout: 6000 });
    // No replace-confirmation and no success toast — the import never reached the save step.
    await expect(page.getByText('Replace page content?')).not.toBeVisible();
    await expect(page.getByText('Imported markdown file')).not.toBeVisible();
  });
});
