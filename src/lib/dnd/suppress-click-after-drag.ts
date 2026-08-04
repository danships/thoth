/**
 * Works around a browser/dnd-kit quirk: when a pointer-driven drag ends over a
 * link/button that wasn't the drag's original target (e.g. because dnd-kit
 * released pointer capture right before drop, or the dragged row's transform
 * reset mid-gesture), the browser can still synthesize a trailing `click` on
 * whatever element is now under the cursor. For sortable rows that wrap
 * navigational links (sidebar tree nodes, sub-page rows), that stray click can
 * navigate the user away immediately after a successful reorder.
 *
 * `markDragEnded` should be called at the very start of every `onDragEnd`
 * handler; it makes `installClickSuppression`'s global capture-phase listener
 * swallow the next `click` event(s) for a short grace period.
 */
let suppressClicksUntil = 0;

const SUPPRESSION_WINDOW_MS = 300;

export function markDragEnded(): void {
  suppressClicksUntil = Date.now() + SUPPRESSION_WINDOW_MS;
}

function handleClickCapture(event: MouseEvent) {
  if (Date.now() < suppressClicksUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function installClickSuppression(): () => void {
  globalThis.addEventListener('click', handleClickCapture, true);

  return () => {
    globalThis.removeEventListener('click', handleClickCapture, true);
  };
}
