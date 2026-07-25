import { useCallback, useRef, useState } from 'react';
import type { PageCover } from '@/types/api';

const DEFAULT_POSITION = 0.5;
const DEFAULT_ZOOM = 1;
const KEYBOARD_STEP = 0.02;
const KEYBOARD_STEP_LARGE = 0.1;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Encapsulates the drag-to-reposition + zoom-to-scale behaviour for the cover editor's
 * preview banner. Keeps a local, live-updating copy of position/zoom while dragging/sliding
 * so the API isn't hit on every pointermove/slider tick, and only persists (via `persistCover`)
 * once the interaction settles (pointer up, slider change end, or a keyboard nudge).
 */
export function useCoverPositioning(
  cover: PageCover | null | undefined,
  persistCover: (next: PageCover | null) => Promise<void>
) {
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);

  const previewReference = useRef<HTMLDivElement>(null);
  const dragStateReference = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const positionX = livePosition?.x ?? cover?.positionX ?? DEFAULT_POSITION;
  const positionY = livePosition?.y ?? cover?.positionY ?? DEFAULT_POSITION;
  const zoom = liveZoom ?? cover?.zoom ?? DEFAULT_ZOOM;

  const resetLive = useCallback(() => {
    setLivePosition(null);
    setLiveZoom(null);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!cover) {
        return;
      }

      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      dragStateReference.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: positionX,
        originY: positionY,
      };
    },
    [cover, positionX, positionY]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateReference.current;
    const preview = previewReference.current;
    if (!dragState || !preview) {
      return;
    }

    const rect = preview.getBoundingClientRect();
    const deltaX = (event.clientX - dragState.startX) / rect.width;
    const deltaY = (event.clientY - dragState.startY) / rect.height;

    // Dragging the image right should move the focal point left (and vice versa), matching
    // the visual direction of the drag.
    const nextX = clamp01(dragState.originX - deltaX);
    const nextY = clamp01(dragState.originY - deltaY);

    setLivePosition({ x: nextX, y: nextY });
  }, []);

  const handlePointerUp = useCallback(async () => {
    if (!dragStateReference.current || !cover) {
      dragStateReference.current = null;
      return;
    }
    dragStateReference.current = null;

    const finalPosition = livePosition;
    if (!finalPosition) {
      return;
    }

    await persistCover({
      ...cover,
      positionX: finalPosition.x,
      positionY: finalPosition.y,
    });
  }, [cover, livePosition, persistCover]);

  // Keyboard alternative to dragging: arrow keys nudge the focal point (Shift for a bigger
  // step), so the reposition control is usable without a pointer device.
  const handleKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!cover) {
        return;
      }

      const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      let deltaX = 0;
      let deltaY = 0;
      switch (event.key) {
        case 'ArrowLeft': {
          deltaX = -step;
          break;
        }
        case 'ArrowRight': {
          deltaX = step;
          break;
        }
        case 'ArrowUp': {
          deltaY = -step;
          break;
        }
        case 'ArrowDown': {
          deltaY = step;
          break;
        }
        default: {
          return;
        }
      }

      event.preventDefault();
      const nextX = clamp01(positionX + deltaX);
      const nextY = clamp01(positionY + deltaY);
      setLivePosition({ x: nextX, y: nextY });
      await persistCover({ ...cover, positionX: nextX, positionY: nextY });
    },
    [cover, positionX, positionY, persistCover]
  );

  const handleZoomChange = useCallback((value: number) => {
    setLiveZoom(value);
  }, []);

  const handleZoomChangeEnd = useCallback(
    async (value: number) => {
      if (!cover) {
        return;
      }
      await persistCover({ ...cover, zoom: value });
    },
    [cover, persistCover]
  );

  return {
    positionX,
    positionY,
    zoom,
    previewReference,
    resetLive,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    handleZoomChange,
    handleZoomChangeEnd,
  };
}

export { DEFAULT_POSITION, DEFAULT_ZOOM };
