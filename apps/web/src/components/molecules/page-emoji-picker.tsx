'use client';

import { ActionIcon, Box, Button, Popover, ScrollArea, Stack, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { IconMoodSmile } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { useNotification } from '@/lib/hooks/use-notification';
import type { UpdatePageBody } from '@/types/api';
import { filterEmojis } from './page-emoji-picker/emoji-list';
import styles from './page-emoji-picker.module.css';

type PersistingProperties = {
  pageId: string;
  emoji: string | null | undefined;
  updatePage: (pageId: string, updates: UpdatePageBody) => Promise<void>;
  value?: undefined;
  onSelect?: undefined;
};

type ControlledProperties = {
  pageId?: undefined;
  updatePage?: undefined;
  emoji: string | null | undefined;
  value: string | null;
  onSelect: (emoji: string | null) => void;
};

type PageEmojiPickerProperties = PersistingProperties | ControlledProperties;

/**
 * Interactive emoji picker for a page's icon. Supports two modes, sharing the same trigger +
 * Popover + search grid UI:
 *  - "persisting" mode (`pageId` + `updatePage`): used on the page-detail header, where the
 *    page already exists and selections are saved immediately via `PATCH /api/v1/pages/:id`.
 *  - "controlled" mode (`value` + `onSelect`): used on the create-page form, where there is no
 *    page id yet, so the parent form owns the emoji value and is notified of changes instead.
 */
export function PageEmojiPicker(properties: PageEmojiPickerProperties) {
  const { emoji } = properties;
  const { showError } = useNotification();

  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');

  const persistEmoji = useCallback(
    async (next: string | null) => {
      if (properties.onSelect) {
        properties.onSelect(next);
        return;
      }

      try {
        await properties.updatePage(properties.pageId, { emoji: next });
      } catch {
        showError('Failed to update page emoji');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [properties.pageId, properties.updatePage, properties.onSelect, showError]
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpened(next);
    if (!next) {
      setSearch('');
    }
  }, []);

  const handleSelect = useCallback(
    (char: string) => {
      setOpened(false);
      setSearch('');
      void persistEmoji(char);
    },
    [persistEmoji]
  );

  const handleClear = useCallback(() => {
    setOpened(false);
    setSearch('');
    void persistEmoji(null);
  }, [persistEmoji]);

  const triggerLabel = emoji ? 'Change page emoji' : 'Set page emoji';
  const results = filterEmojis(search);

  return (
    <Popover
      position="bottom-start"
      withArrow
      shadow="md"
      trapFocus
      opened={opened}
      onChange={handleOpenChange}
      closeOnClickOutside
      closeOnEscape
    >
      <Popover.Target>
        <Tooltip label={triggerLabel}>
          <ActionIcon
            className={styles['trigger'] ?? ''}
            variant="subtle"
            size="lg"
            aria-label={triggerLabel}
            onClick={() => handleOpenChange(!opened)}
          >
            {emoji ? <span className={styles['emoji'] ?? ''}>{emoji}</span> : <IconMoodSmile size={20} />}
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            aria-label="Search emojis"
            placeholder="Search emojis"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            data-autofocus
          />
          {emoji && (
            <Button variant="subtle" color="red" size="xs" onClick={handleClear}>
              Remove emoji
            </Button>
          )}
          <ScrollArea.Autosize mah={220}>
            <Box className={styles['grid'] ?? ''}>
              {results.map((entry) => (
                <UnstyledButton
                  key={entry.char}
                  className={styles['cell'] ?? ''}
                  aria-label={entry.keywords[0] ?? entry.char}
                  onClick={() => handleSelect(entry.char)}
                >
                  {entry.char}
                </UnstyledButton>
              ))}
            </Box>
          </ScrollArea.Autosize>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
