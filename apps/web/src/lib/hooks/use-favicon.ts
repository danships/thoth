'use client';

import { useEffect } from 'react';

const FAVICON_SELECTOR = 'link[rel~="icon"]';
const FAVICON_SIZE = 64;

/**
 * Renders a single emoji glyph onto an offscreen canvas and returns it as a PNG data URL,
 * suitable for use as a `<link rel="icon">` href. Returns `null` if canvas rendering isn't
 * available (e.g. during SSR, or in browsers without 2D canvas support).
 */
function emojiToDataUrl(emoji: string): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
  context.font = `${FAVICON_SIZE * 0.8}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // A slight vertical nudge keeps most emoji glyphs optically centered — their built-in
  // baseline metrics tend to sit a little high otherwise.
  context.fillText(emoji, FAVICON_SIZE / 2, FAVICON_SIZE / 2 + FAVICON_SIZE * 0.05);

  return canvas.toDataURL('image/png');
}

/**
 * Swaps the browser tab's favicon to render `emoji` (THOTH-068) for as long as this hook stays
 * mounted with a non-empty value, restoring the original `<link rel="icon">` href — the site's
 * default favicon — once `emoji` is cleared or the calling component unmounts (e.g. navigating
 * away from the page). Pass `undefined`/`null`/`''` to leave the current favicon untouched.
 */
export function useFavicon(emoji: string | null | undefined): void {
  useEffect(() => {
    if (!emoji) {
      return;
    }

    const link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
    if (!link) {
      return;
    }

    const originalHref = link.href;

    const dataUrl = emojiToDataUrl(emoji);
    if (!dataUrl) {
      return;
    }

    link.href = dataUrl;

    return () => {
      link.href = originalHref;
    };
  }, [emoji]);
}
