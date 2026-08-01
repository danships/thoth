import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// The upload endpoint rejects genuinely dangerous file types outright (415, see
// `file-upload.spec.ts`'s "dangerous file types are rejected at upload" case), so there's no way
// to end up with a *served* dangerous file to click on. What this spec exercises instead is the
// client-side interception itself: it fires purely off the clicked anchor's visible filename
// (see `page-detail-editor.tsx`'s `handleClick`), so a markdown link whose *text* names a
// dangerous extension is enough to trigger the warning modal, regardless of what the URL behind
// it actually serves. The link is injected via the "Import from Markdown" action so it is
// reliably parsed into a real link node (typing raw markdown syntax doesn't trigger BlockNote's
// auto-conversion the same way a markdown import does).
test('clicking a link to a dangerous-looking filename shows a confirmation modal', async ({ page }) => {
  const markdown = `[malware.exe](/api/v1/files/${SEED.file.id}/content)`;

  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.file.page.id}`);
  await page.getByRole('button', { name: 'Page menu' }).click();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Import from Markdown' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'import.md', mimeType: 'text/markdown', buffer: Buffer.from(markdown) });

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

  await page.getByRole('tab', { name: 'Contents' }).click();
  const link = page.locator('.bn-editor a', { hasText: 'malware.exe' });
  await expect(link).toBeVisible({ timeout: 10_000 });

  // BlockNote's contentEditable only follows links on Ctrl/Cmd+Click (a plain click just places
  // the text cursor, matching most rich-text/Notion-style editors), so the interception must be
  // exercised the same way a real user would trigger it.
  await link.click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByText('This file may be dangerous')).toBeVisible();

  // Cancel keeps the modal from proceeding — no new tab, modal dismissed.
  await page.getByRole('button', { name: 'Cancel opening potentially dangerous file' }).click();
  await expect(page.getByText('This file may be dangerous')).not.toBeVisible();

  // Confirm proceeds to open the file — stub `window.open` rather than asserting on a real
  // browser popup, since headless Chromium's popup-blocking/user-gesture propagation through an
  // async modal confirm handler is flaky in CI and isn't what this test is meant to exercise.
  await page.evaluate(() => {
    (globalThis as unknown as { __openedUrls: string[] }).__openedUrls = [];
    window.open = (url) => {
      (globalThis as unknown as { __openedUrls: string[] }).__openedUrls.push(String(url));
      return null;
    };
  });

  await link.click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByText('This file may be dangerous')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm opening potentially dangerous file' }).click();
  await expect(page.getByText('This file may be dangerous')).not.toBeVisible();

  const openedUrls = await page.evaluate(() => (globalThis as unknown as { __openedUrls: string[] }).__openedUrls);
  expect(openedUrls.length).toBeGreaterThanOrEqual(1);
  for (const url of openedUrls) {
    expect(url).toContain(`/api/v1/files/${SEED.file.id}/content`);
  }
});
