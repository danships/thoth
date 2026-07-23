'use client';

import { ActionIcon, Box, Button, Group, Modal, Slider, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconArrowsMove, IconPhotoPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNotification } from '@/lib/hooks/use-notification';
import type { PageCover, UpdatePageBody } from '@/types/api';
import styles from './page-cover-editor.module.css';

type PageCoverEditorProperties = {
  pageId: string;
  cover: PageCover | null | undefined;
  updatePage: (pageId: string, updates: UpdatePageBody) => Promise<void>;
};

const DEFAULT_POSITION = 0.5;
const DEFAULT_ZOOM = 1;

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
 */
export function PageCoverEditor({ pageId, cover, updatePage }: PageCoverEditorProperties) {
  const { showError } = useNotification();

  const [modalOpened, setModalOpened] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isRepositioning, setIsRepositioning] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Local, live-updating copy of the position/zoom while dragging/sliding, so the API isn't
  // hit on every pointermove/slider tick. Falls back to the persisted `cover` otherwise.
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);

  const bannerReference = useRef<HTMLDivElement>(null);
  const dragStateReference = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const positionX = livePosition?.x ?? cover?.positionX ?? DEFAULT_POSITION;
  const positionY = livePosition?.y ?? cover?.positionY ?? DEFAULT_POSITION;
  const zoom = liveZoom ?? cover?.zoom ?? DEFAULT_ZOOM;

  const isUrlValid = useMemo(() => isValidImageUrl(imageUrlInput.trim()), [imageUrlInput]);

  const openAddModal = useCallback(() => {
    setImageUrlInput(cover?.imageUrl ?? '');
    setModalOpened(true);
  }, [cover]);

  const closeModal = useCallback(() => setModalOpened(false), []);

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

  const handleSubmitImage = useCallback(async () => {
    const trimmed = imageUrlInput.trim();
    if (!isValidImageUrl(trimmed)) {
      return;
    }

    setImageFailed(false);
    setModalOpened(false);
    await persistCover({
      imageUrl: trimmed,
      positionX: DEFAULT_POSITION,
      positionY: DEFAULT_POSITION,
      zoom: DEFAULT_ZOOM,
    });
  }, [imageUrlInput, persistCover]);

  const handleRemove = useCallback(async () => {
    setIsRepositioning(false);
    setLivePosition(null);
    setLiveZoom(null);
    await persistCover(null);
  }, [persistCover]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isRepositioning || !cover) {
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
    [isRepositioning, cover, positionX, positionY]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateReference.current;
    const banner = bannerReference.current;
    if (!dragState || !banner) {
      return;
    }

    const rect = banner.getBoundingClientRect();
    const deltaX = (event.clientX - dragState.startX) / rect.width;
    const deltaY = (event.clientY - dragState.startY) / rect.height;

    // Dragging the image right should move the focal point left (and vice versa), matching
    // the visual direction of the drag.
    const nextX = Math.min(1, Math.max(0, dragState.originX - deltaX));
    const nextY = Math.min(1, Math.max(0, dragState.originY - deltaY));

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

  return (
    <Stack gap="xs">
      <Box
        ref={bannerReference}
        className={`${styles['banner'] ?? ''} ${isRepositioning ? (styles['repositioning'] ?? '') : ''}`}
        style={
          {
            '--cover-position-x': `${positionX * 100}%`,
            '--cover-position-y': `${positionY * 100}%`,
            '--cover-zoom': `${zoom * 100}%`,
            '--cover-image': `url(${JSON.stringify(cover.imageUrl)})`,
          } as React.CSSProperties
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover.imageUrl}
          alt=""
          aria-hidden="true"
          className={styles['hiddenProbe'] ?? ''}
          onError={() => setImageFailed(true)}
        />
        <Group className={styles['controls'] ?? ''} gap="xs">
          <Tooltip label={isRepositioning ? 'Done repositioning' : 'Reposition'}>
            <ActionIcon
              variant={isRepositioning ? 'filled' : 'default'}
              aria-label={isRepositioning ? 'Done repositioning' : 'Reposition cover'}
              onClick={() => setIsRepositioning((previous) => !previous)}
            >
              <IconArrowsMove size={16} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" variant="default" onClick={openAddModal}>
            Change image
          </Button>
          <Tooltip label="Remove cover">
            <ActionIcon variant="default" aria-label="Remove cover" onClick={handleRemove}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
      {isRepositioning && (
        <Group gap="sm" wrap="nowrap">
          <Text size="sm" c="dimmed">
            Zoom
          </Text>
          <Box className={styles['zoomSlider'] ?? ''}>
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={handleZoomChange}
              onChangeEnd={handleZoomChangeEnd}
              label={(value) => `${value.toFixed(2)}x`}
              thumbLabel="Cover zoom"
            />
          </Box>
        </Group>
      )}
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

type CoverUrlModalProperties = {
  opened: boolean;
  value: string;
  isValid: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function CoverUrlModal({ opened, value, isValid, onChange, onClose, onSubmit }: CoverUrlModalProperties) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Page cover image"
      centered
      closeButtonProps={{ 'aria-label': 'Close', icon: <IconX size={16} /> }}
    >
      <Stack gap="md">
        <TextInput
          label="Image URL"
          placeholder="https://example.com/image.jpg"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          error={value.length > 0 && !isValid ? 'Enter a valid http(s) URL' : null}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!isValid}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
