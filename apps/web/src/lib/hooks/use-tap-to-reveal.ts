'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-tap pattern for controls that are normally only shown on hover (e.g. an overlay
 * edit button). Touch devices don't have a hover state, so instead of always showing the
 * control (which permanently blocks part of the UI), the first tap anywhere inside the
 * returned `containerReference` reveals it. It's hidden again on the next tap/click outside
 * of the container, so it never lingers on screen.
 *
 * Desktop pointer users are unaffected: hover/focus-within can keep being handled purely in
 * CSS, independent of this hook's state.
 */
export function useTapToReveal<T extends HTMLElement = HTMLElement>() {
  const [isRevealed, setIsRevealed] = useState(false);
  const containerReference = useRef<T>(null);

  const reveal = useCallback(() => setIsRevealed(true), []);
  const hide = useCallback(() => setIsRevealed(false), []);
  const toggle = useCallback(() => setIsRevealed((current) => !current), []);

  useEffect(() => {
    if (!isRevealed) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerReference.current?.contains(event.target as Node)) {
        setIsRevealed(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isRevealed]);

  return { isRevealed, containerReference, reveal, hide, toggle };
}
