import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.use({ viewport: { width: 390, height: 844 } });

test('block editor fills the available viewport height on mobile', async ({ page }) => {
  await page.goto(`/pages/${SEED.pages.child.id}`);
  await expect(page.getByRole('heading', { name: SEED.pages.child.name })).toBeVisible();

  const contentsTab = page.getByRole('tab', { name: 'Contents' });
  await expect(contentsTab).toBeVisible();
  await contentsTab.click();
  await expect(contentsTab).toHaveAttribute('aria-selected', 'true');

  // Use the BlockNote-specific class rather than a generic `[contenteditable]`
  // selector: the page title heading is also contentEditable and sorts first
  // in DOM order, so a generic selector would measure the wrong element.
  const editor = page.locator('.bn-editor');
  await expect(editor).toBeVisible({ timeout: 10_000 });

  // Poll briefly for the final height in case the editor's flex layout settles
  // asynchronously after BlockNote hydration.
  await expect
    .poll(
      async () => {
        const boundingBox = await editor.boundingBox();
        return boundingBox?.height ?? 0;
      },
      { timeout: 5000 }
    )
    .toBeGreaterThan(300);

  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasPageOverflow).toBe(false);
});
