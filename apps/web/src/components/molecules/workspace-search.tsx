'use client';

import { ActionIcon, Group, Loader, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconFileText, IconSearch } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { usePageSearch } from '@/lib/hooks/api/use-page-search';
import { buildPageUrlId } from '@/lib/utils/page-url';
import classes from './workspace-search.module.css';

type WorkspaceSearchProperties = {
  workspaceId: string;
  workspaceSlug: string;
};

export function WorkspaceSearch({ workspaceId, workspaceSlug }: WorkspaceSearchProperties) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const { results, isLoading, error } = usePageSearch(workspaceId, query);
  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const closeModal = () => {
    setOpened(false);
    setQuery('');
  };

  return (
    <>
      <ActionIcon variant="subtle" color="gray" aria-label="Search pages" onClick={() => setOpened(true)}>
        <IconSearch size={20} />
      </ActionIcon>

      <Modal opened={opened} onClose={closeModal} title="Search this workspace" centered>
        <Stack gap="sm">
          <TextInput
            label="Search pages"
            aria-label="Search pages"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />

          {isLoading && (
            <Group justify="center" py="md">
              <Loader size="sm" aria-label="Searching" />
            </Group>
          )}

          {!isLoading && error !== null && (
            <Text size="sm" c="dimmed" ta="center">
              Search is temporarily unavailable
            </Text>
          )}

          {!isLoading && error === null && trimmedQuery.length === 0 && (
            <Text size="sm" c="dimmed" ta="center">
              Type to search pages
            </Text>
          )}

          {!isLoading && error === null && trimmedQuery.length > 0 && results.length === 0 && (
            <Text size="sm" c="dimmed" ta="center">
              No pages found
            </Text>
          )}

          {error === null &&
            results.map((result) => (
              <UnstyledButton
                key={result.page.id}
                className={classes['resultButton']}
                onClick={() => {
                  closeModal();
                  router.push(`/${workspaceSlug}/pages/${buildPageUrlId(result.page.id, result.page.name)}`);
                }}
              >
                <div className={classes['resultContent']}>
                  {result.page.emoji ? (
                    <span className={classes['resultEmoji']} aria-hidden="true">
                      {result.page.emoji}
                    </span>
                  ) : (
                    <span className={classes['resultIcon']} aria-hidden="true">
                      <IconFileText size={16} />
                    </span>
                  )}
                  <div className={classes['resultText']}>
                    <Text fw={500}>{result.page.name}</Text>
                    <Text size="sm" c="dimmed" className={classes['snippet']}>
                      {result.snippet}
                    </Text>
                  </div>
                </div>
              </UnstyledButton>
            ))}
        </Stack>
      </Modal>
    </>
  );
}
