'use client';

import { ActionIcon, Box, Button, Group, Stack, Tooltip } from '@mantine/core';
import { IconEdit, IconPhotoPlus } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCoverPositioning, DEFAULT_POSITION, DEFAULT_ZOOM } from '@/lib/hooks/use-cover-positioning';
import { useTapToReveal } from '@/lib/hooks/use-tap-to-reveal';
import type { PageCover, UpdatePageBody } from '@/types/api';
import { CoverUrlModal } from './page-cover-editor/cover-url-modal';
import { ManageCoverModal } from './page-cover-editor/manage-cover-modal';
import styles from './page-cover-editor.module.css';

type PageCoverEditorProperties = {
  pageId: string;
  cover: PageCover | null | undefined;
  updatePage: (pageId: string, updates: UpdatePageBody) => Promise<void>;
};

function isValidImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * In-place editor for a page's cover image: lets the author set/replace/remove the image,
 * and drag-to-reposition + zoom-to-scale it within a fixed 16/5 banner. Position/zoom are
 * normalized to [0,1] (position) / [1,3] (zoom) and persisted via the existing `PATCH
 * /api/v1/pages/:id` endpoint (through the `updatePage` function passed down from the page).
 *
 * The reposition/zoom controls live in a dedicated modal (opened via a small edit icon that
 * only appears on hover, or on tap via `useTapToReveal` on touch devices) so they never
 * obscure the banner image itself, especially on small/mobile viewports. The heavier
 * drag/keyboard/zoom logic lives in `useCoverPositioning`, and the two modals are broken out
 * into their own components under `page-cover-editor/`.
 */
export function PageCoverEditor({ pageId, cover, updatePage }: PageCoverEditorProperties) {
  const { showError } = useNotification();

  const [modalOpened, setModalOpened] = useState(false);
  const [manageModalOpened, setManageModalOpened] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  const { isRevealed, containerReference, toggle: toggleEditButtonRevealed } = useTapToReveal<HTMLDivElement>();

  const isUrlValid = useMemo(() => isValidImageUrl(imageUrlInput.trim()), [imageUrlInput]);

  const openAddModal = useCallback(() => {
    setImageUrlInput(cover?.imageUrl ?? '');
    setManageModalOpened(false);
    setModalOpened(true);
  }, [cover]);

  const closeModal = useCallback(() => setModalOpened(false), []);

  const openManageModal = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setManageModalOpened(true);
  }, []);
  const closeManageModal = useCallback(() => setManageModalOpened(false), []);

  const persistCover = useCallback(
    async (next: PageCover | null) => {
      try {
        await updatePage(pageId, { cover: next });
      } catch {
        showError('Failed to update page cover');
      }
    },
    [pageId, updatePage, showError]
  );

  const {
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
  } = useCoverPositioning(cover, persistCover);

  const handleSubmitImage = useCallback(async () => {
    const trimmed = imageUrlInput.trim();
    if (!isValidImageUrl(trimmed)) {
      return;
    }

    setImageFailed(false);
    setModalOpened(false);
    resetLive();
    await persistCover({
      imageUrl: trimmed,
      positionX: DEFAULT_POSITION,
      positionY: DEFAULT_POSITION,
      zoom: DEFAULT_ZOOM,
    });
  }, [imageUrlInput, persistCover, resetLive]);

  const handleRemove = useCallback(async () => {
    setManageModalOpened(false);
    resetLive();
    await persistCover(null);
  }, [persistCover, resetLive]);

  const coverStyle = {
    '--cover-position-x': `${positionX * 100}%`,
    '--cover-position-y': `${positionY * 100}%`,
    '--cover-zoom': `${zoom * 100}%`,
    '--cover-image': cover ? `url(${JSON.stringify(cover.imageUrl)})` : 'none',
  } as React.CSSProperties;

  if (!cover || imageFailed) {
    return (
      <>
        <Group>
          <Button size="xs" variant="default" leftSection={<IconPhotoPlus size={16} />} onClick={openAddModal}>
            Add cover
          </Button>
        </Group>
        <CoverUrlModal
          opened={modalOpened}
          value={imageUrlInput}
          isValid={isUrlValid}
          onChange={setImageUrlInput}
          onClose={closeModal}
          onSubmit={handleSubmitImage}
        />
      </>
    );
  }

  const bannerClassName = [styles['banner'], isRevealed ? styles['revealed'] : ''].filter(Boolean).join(' ');

  return (
    <Stack gap="xs">
      <Box ref={containerReference} className={bannerClassName} style={coverStyle} onClick={toggleEditButtonRevealed}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover.imageUrl}
          alt=""
          aria-hidden="true"
          className={styles['hiddenProbe'] ?? ''}
          onError={() => setImageFailed(true)}
        />
        <Tooltip label="Edit cover">
          <ActionIcon
            className={styles['editButton'] ?? ''}
            variant="default"
            aria-label="Edit cover"
            onClick={openManageModal}
          >
            <IconEdit size={16} />
          </ActionIcon>
        </Tooltip>
      </Box>
      <ManageCoverModal
        opened={manageModalOpened}
        onClose={closeManageModal}
        previewReference={previewReference}
        coverStyle={coverStyle}
        zoom={zoom}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        onZoomChange={handleZoomChange}
        onZoomChangeEnd={handleZoomChangeEnd}
        onChangeImage={openAddModal}
        onRemove={handleRemove}
      />
      <CoverUrlModal
        opened={modalOpened}
        value={imageUrlInput}
        isValid={isUrlValid}
        onChange={setImageUrlInput}
        onClose={closeModal}
        onSubmit={handleSubmitImage}
      />
    </Stack>
  );
}
