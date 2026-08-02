'use client';

import { useEffect } from 'react';

/**
 * Sets `document.title` for client components, which (unlike server components/layouts) can't
 * export a static `metadata` object for Next.js to pick up. Always suffixed with " :: thoth"
 * (THOTH-046) to match the `%s :: thoth` template applied to server-rendered `metadata.title`
 * values in the root layout (`src/app/layout.tsx`).
 *
 * Pass `undefined` while the real title isn't known yet (e.g. still loading) to leave the
 * previous/default title in place rather than flashing an empty one.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) {
      return;
    }
    document.title = `${title} :: thoth`;
  }, [title]);
}
