import type { Locator, Page } from '@playwright/test';

// Simulates a `@dnd-kit` `PointerSensor` drag: real mouse events (not HTML5 drag-and-drop, which
// dnd-kit doesn't use) — press on the handle, move past the sensor's activation-distance
// threshold, move onto the target, then release. Chromium fires pointer events alongside mouse
// events, which is all `PointerSensor` listens for.
export async function dragHandleOnto(page: Page, handle: Locator, target: Locator): Promise<void> {
  // Scroll both endpoints into view first — long lists (e.g. `childOverflowHost`'s children, or
  // a data view with many rows) can otherwise leave the handle or target outside the viewport (or
  // outside a scrollable pane's visible area), in which case `boundingBox()` still returns
  // coordinates, but they may fall outside where the mouse can actually interact, causing the
  // "drag" to silently miss its target instead of reordering anything.
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error('dragHandleOnto: could not resolve bounding box for handle or target');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed the 5px pointer-sensor activation-distance constraint before the "real" move, or
  // dnd-kit never starts tracking the drag.
  await page.mouse.move(startX, startY + 10, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}
