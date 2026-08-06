import { ActionIcon, Box, Button, Group, Modal, Slider, Stack, Text, Tooltip } from '@mantine/core';
import { IconTrash, IconX } from '@tabler/icons-react';
import styles from './manage-cover-modal.module.css';

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

/**
 * Modal for repositioning/zooming an already-set cover image (drag or arrow keys to reposition,
 * slider to zoom), plus shortcuts to change or remove the image entirely.
 */
export function ManageCoverModal({
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
