'use client';

import { ActionIcon, Box, Button, Group, Modal, Slider, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconEdit, IconPhotoPlus, IconTrash, IconX } from '@tabler/icons-react';
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
const KEYBOARD_STEP = 0.02;
const KEYBOARD_STEP_LARGE = 0.1;

function isValidImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * In-place editor for a page's cover image: lets the author set/replace/remove the image,
 * and drag-to-reposition + zoom-to-scale it within a fixed 16/5 banner. Position/zoom are
 * normalized to [0,1] (position) / [1,3] (zoom) and persisted via the existing `PATCH
 * /api/v1/pages/:id` endpoint (through the `updatePage` function passed down from the page).
 *
 * The reposition/zoom controls live in a dedicated modal (opened via a small edit icon that
 * only appears on hover, or is always shown on touch devices) so they never obscure the banner
 * image itself, especially on small/mobile viewports.
 */
export function PageCoverEditor({ pageId, cover, updatePage }: PageCoverEditorProperties) {
  const { showError } = useNotification();

  const [modalOpened, setModalOpened] = useState(false);
  const [manageModalOpened, setManageModalOpened] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  // Local, live-updating copy of the position/zoom while dragging/sliding, so the API isn't
  // hit on every pointermove/slider tick. Falls back to the persisted `cover` otherwise.
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);

  const previewReference = useRef<HTMLDivElement>(null);
  const dragStateReference = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const positionX = livePosition?.x ?? cover?.positionX ?? DEFAULT_POSITION;
  const positionY = livePosition?.y ?? cover?.positionY ?? DEFAULT_POSITION;
  const zoom = liveZoom ?? cover?.zoom ?? DEFAULT_ZOOM;

  const isUrlValid = useMemo(() => isValidImageUrl(imageUrlInput.trim()), [imageUrlInput]);

  const openAddModal = useCallback(() => {
    setImageUrlInput(cover?.imageUrl ?? '');
    setManageModalOpened(false);
    setModalOpened(true);
  }, [cover]);

  const closeModal = useCallback(() => setModalOpened(false), []);

  const openManageModal = useCallback(() => setManageModalOpened(true), []);
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

  const handleSubmitImage = useCallback(async () => {
    const trimmed = imageUrlInput.trim();
    if (!isValidImageUrl(trimmed)) {
      return;
    }

    setImageFailed(false);
    setModalOpened(false);
    setLivePosition(null);
    setLiveZoom(null);
    await persistCover({
      imageUrl: trimmed,
      positionX: DEFAULT_POSITION,
      positionY: DEFAULT_POSITION,
      zoom: DEFAULT_ZOOM,
    });
  }, [imageUrlInput, persistCover]);

  const handleRemove = useCallback(async () => {
    setManageModalOpened(false);
    setLivePosition(null);
    setLiveZoom(null);
    await persistCover(null);
  }, [persistCover]);

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

  return (
    <Stack gap="xs">
      <Box className={styles['banner'] ?? ''} style={coverStyle}>
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

type ManageCoverModalProperties = {
  opened: boolean;
  onClose: () => void;
  previewReference: React.RefObject<HTMLDivElement | null>;
  coverStyle: React.CSSProperties;
  zoom: number;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onZoomChange: (value: number) => void;
  onZoomChangeEnd: (value: number) => void;
  onChangeImage: () => void;
  onRemove: () => void;
};

function ManageCoverModal({
  opened,
  onClose,
  previewReference,
  coverStyle,
  zoom,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onZoomChange,
  onZoomChangeEnd,
  onChangeImage,
  onRemove,
}: ManageCoverModalProperties) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit cover image"
      centered
      size="lg"
      closeButtonProps={{ 'aria-label': 'Close', icon: <IconX size={16} /> }}
    >
      <Stack gap="md">
        <Box
          ref={previewReference}
          className={styles['previewBanner'] ?? ''}
          style={coverStyle}
          tabIndex={0}
          role="group"
          aria-label="Cover position. Drag to reposition, or use the arrow keys (hold Shift for larger steps)."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
        />
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
              onChange={onZoomChange}
              onChangeEnd={onZoomChangeEnd}
              label={(value) => `${value.toFixed(2)}x`}
              thumbLabel="Cover zoom"
            />
          </Box>
        </Group>
        <Group justify="space-between">
          <Button size="xs" variant="default" onClick={onChangeImage}>
            Change image
          </Button>
          <Tooltip label="Remove cover">
            <ActionIcon variant="default" aria-label="Remove cover" onClick={onRemove}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group justify="flex-end">
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
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
