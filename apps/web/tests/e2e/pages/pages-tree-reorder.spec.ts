import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import { dragHandleOnto } from '../utils/drag-and-drop';

// THOTH-036: manual drag-and-drop reordering of child pages in the sidebar tree. Root branches
// are permanently out of scope (see spec), so this exercises the child list under an expanded
// parent — `SEED.pages.childOverflowHost`, which already seeds more than the preview limit of
// children, giving a deterministic, isolated group to reorder without touching other specs.
test.describe('Pages tree drag-and-drop reordering', () => {
  test('dragging a child page reorders it under its parent and persists across reload', async ({ page }) => {
    const first = SEED.pages.childOverflowHost.children.at(0)!;
    const second = SEED.pages.childOverflowHost.children.at(1)!;
    const scrollPane = page.getByTestId('pages-tree-scroll-pane');

    const expandHostNode = async () => {
      const hostLink = scrollPane.getByRole('link', {
        name: new RegExp(SEED.pages.childOverflowHost.name),
      });
      await expect(hostLink).toBeVisible();
      await hostLink.locator('..').getByRole('button').first().click();
      // Give any pending client-side navigation/streaming (e.g. the dev server settling on the
      // final redirect target of the bare `/pages` route) a chance to finish before starting a
      // timing-sensitive drag gesture, rather than racing it.
      await page.waitForLoadState('networkidle');
    };

    // Drag-and-drop against a `pnpm dev` (Turbopack) server can occasionally race an in-flight
    // compile/streaming-render with the synthetic pointer gesture, causing the tree to reset or
    // the drop to land as a no-op. Retry the whole interaction a bounded number of times rather
    // than accept single-attempt flakiness that isn't present in a production build. Each retry
    // first checks the *currently persisted* order — if a prior attempt's request actually
    // succeeded (only the visual assertion below timed out), dragging again would reverse the
    // already-correct order, so a further drag is only issued while `first` still precedes
    // `second`.
    let reordered = false;
    for (let attempt = 1; attempt <= 3 && !reordered; attempt += 1) {
      await page.goto(`/${SEED.workspace.slug}/pages`);
      await page.waitForLoadState('networkidle');
      await expandHostNode();

      const firstHandle = page.getByTestId(`tree-drag-handle-${first.id}`);
      const secondHandle = page.getByTestId(`tree-drag-handle-${second.id}`);
      await expect(firstHandle).toBeVisible();
      await expect(secondHandle).toBeVisible();

      const firstTextBefore = await scrollPane.getByText(first.name).boundingBox();
      const secondTextBefore = await scrollPane.getByText(second.name).boundingBox();
      if (secondTextBefore && firstTextBefore && secondTextBefore.y < firstTextBefore.y) {
        // Already in the desired order — a previous attempt's request must have persisted
        // successfully even though its visual assertion timed out. Nothing left to do.
        reordered = true;
        break;
      }

      const reorderResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/pages/${second.id}/reorder`) && response.request().method() === 'POST'
      );
      await dragHandleOnto(page, secondHandle, firstHandle);
      const reorderResponse = await reorderResponsePromise;
      expect(reorderResponse.ok()).toBe(true);

      try {
        await expect(async () => {
          const firstText = await scrollPane.getByText(first.name).boundingBox();
          const secondText = await scrollPane.getByText(second.name).boundingBox();
          expect(firstText).toBeTruthy();
          expect(secondText).toBeTruthy();
          expect(secondText!.y).toBeLessThan(firstText!.y);
        }).toPass({ timeout: 5000 });
        reordered = true;
      } catch (error) {
        if (attempt === 3) {
          throw error;
        }
      }
    }

    await page.reload();
    const hostLinkAfterReload = scrollPane.getByRole('link', {
      name: new RegExp(SEED.pages.childOverflowHost.name),
    });
    await expect(hostLinkAfterReload).toBeVisible();
    await hostLinkAfterReload.locator('..').getByRole('button').first().click();

    const firstTextAfterReload = await scrollPane.getByText(first.name).boundingBox();
    const secondTextAfterReload = await scrollPane.getByText(second.name).boundingBox();
    expect(secondTextAfterReload!.y).toBeLessThan(firstTextAfterReload!.y);
  });
});
