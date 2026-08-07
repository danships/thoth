'use client';

import { useState } from 'react';
import type { PageCover } from '@/types/api';
import styles from './page-cover-banner.module.css';

type PageCoverBannerProperties = {
  cover: PageCover | null | undefined;
};

/**
 * Read-only banner rendering a page's cover image at the top of the page detail view.
 * Uses a hidden `<img>` to detect a broken/unreachable `imageUrl` (background-image has no
 * `onError`), hiding the banner entirely if the image fails to load rather than showing a
 * broken-image icon.
 */
export function PageCoverBanner({ cover }: PageCoverBannerProperties) {
  const [failed, setFailed] = useState(false);

  if (!cover || failed) {
    return null;
  }

  return (
    <div
      className={styles['banner']}
      style={
        {
          '--cover-position-x': `${cover.positionX * 100}%`,
          '--cover-position-y': `${cover.positionY * 100}%`,
          '--cover-zoom': `${cover.zoom * 100}%`,
          '--cover-image': `url(${JSON.stringify(cover.imageUrl)})`,
        } as React.CSSProperties
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.imageUrl}
        alt=""
        aria-hidden="true"
        className={styles['hiddenProbe']}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
