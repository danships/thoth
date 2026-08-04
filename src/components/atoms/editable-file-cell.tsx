'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { AxiosError } from 'axios';
import { ActionIcon, Anchor, Box, CloseButton, Group, Image, Loader, Text, UnstyledButton } from '@mantine/core';
import { IconFile, IconUpload } from '@tabler/icons-react';
import { api } from '@/lib/api/client';
import { swrFetcher } from '@/lib/swr/fetcher';
import { useNotification } from '@/lib/hooks/use-notification';
import { SAFE_INLINE_IMAGE_MIME_TYPES } from '@/lib/files/constants';
import type { GetFileResponse } from '@/types/api';
import styles from './editable-file-cell.module.css';

type EditableFileCellProperties = {
  value: string | null;
  pageId: string;
  disabled?: boolean;
  onChange: (fileId: string | null) => void;
};

/**
 * Editable single-file cell for a `file` column (THOTH-054). Renders an upload affordance when
 * empty; once a file is attached, fetches its metadata (`GET /files/:id`) to decide between an
 * inline image thumbnail (mime in `SAFE_INLINE_IMAGE_MIME_TYPES`) or a download chip. A dangling
 * id (the underlying file was deleted, or is no longer reachable) degrades to a muted "File
 * unavailable" chip rather than crashing — see THOTH-054's Edge Cases.
 */
export function EditableFileCell({ value, pageId, disabled = false, onChange }: EditableFileCellProperties) {
  const [uploading, setUploading] = useState(false);
  const inputReference = useRef<HTMLInputElement>(null);
  const { showError } = useNotification();

  const { data: file, error } = useSWR<GetFileResponse>(value ? `/files/${value}` : null, swrFetcher);

  const handleFileSelected = async (fileList: FileList | null) => {
    const selected = fileList?.[0];
    if (!selected) {
      return;
    }

    setUploading(true);
    try {
      const response = await api.files.upload(selected, { pageId });
      onChange(response.data.data.id);
    } catch (uploadError) {
      if (uploadError instanceof AxiosError) {
        switch (uploadError.response?.status) {
          case 409: {
            showError('Workspace storage limit reached', 'Upload failed');
            break;
          }
          case 413: {
            showError('File is too large to upload', 'Upload failed');
            break;
          }
          case 415: {
            showError('This file type is not allowed', 'Upload failed');
            break;
          }
          default: {
            showError('Failed to upload file', 'Upload failed');
          }
        }
      } else {
        showError('Failed to upload file', 'Upload failed');
      }
    } finally {
      setUploading(false);
      if (inputReference.current) {
        inputReference.current.value = '';
      }
    }
  };

  const handleRemove = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(null);
  };

  const handleUploadClick = () => {
    if (!disabled && !uploading) {
      inputReference.current?.click();
    }
  };

  const hiddenInput = (
    <input
      ref={inputReference}
      type="file"
      className={styles['hiddenInput'] ?? ''}
      onChange={(event) => handleFileSelected(event.target.files)}
      disabled={disabled || uploading}
      aria-label="Upload file"
      data-testid="file-cell-input"
    />
  );

  if (!value) {
    return (
      <Box className={styles['target'] ?? ''}>
        {hiddenInput}
        <ActionIcon
          variant="subtle"
          onClick={handleUploadClick}
          disabled={disabled}
          loading={uploading}
          aria-label="Upload file"
          data-testid="file-cell-upload"
        >
          <IconUpload size={16} />
        </ActionIcon>
      </Box>
    );
  }

  if (error) {
    return (
      <Group gap="xs" wrap="nowrap" data-testid="file-cell-unavailable">
        <Text c="dimmed" size="sm">
          File unavailable
        </Text>
        {!disabled && <CloseButton size="sm" onClick={handleRemove} aria-label="Remove file" />}
      </Group>
    );
  }

  if (!file) {
    return <Loader size="xs" data-testid="file-cell-loading" />;
  }

  const isInlineImage = SAFE_INLINE_IMAGE_MIME_TYPES.includes(file.mimeType);

  return (
    <Group gap="xs" wrap="nowrap" justify="space-between" w="100%" data-testid="file-cell-filled">
      {hiddenInput}
      {isInlineImage ? (
        <UnstyledButton
          onClick={handleUploadClick}
          disabled={disabled || uploading}
          aria-label={`Replace ${file.filename}`}
          className={disabled ? undefined : styles['thumbnail']}
        >
          <Image
            src={api.files.getContentUrl(file.id)}
            alt={file.filename}
            h={32}
            w={32}
            fit="cover"
            radius="sm"
            data-testid="file-cell-thumbnail"
          />
        </UnstyledButton>
      ) : (
        <Anchor
          href={api.files.getContentUrl(file.id)}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          className={styles['chip'] ?? ''}
          data-testid="file-cell-chip"
        >
          <Group gap={4} wrap="nowrap">
            <IconFile size={14} />
            <Text size="sm" truncate>
              {file.filename}
            </Text>
          </Group>
        </Anchor>
      )}
      {!disabled && <CloseButton size="sm" onClick={handleRemove} aria-label="Remove file" />}
    </Group>
  );
}
