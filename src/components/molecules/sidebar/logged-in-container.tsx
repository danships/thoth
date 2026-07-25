'use client';
import { PagesTree } from '../pages-tree';
import { usePagesTree } from '@/lib/hooks/api/use-pages-tree';
import { ActionIcon, Anchor, Box, Group, Loader, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useCallback, useRef, type UIEvent } from 'react';
import styles from './logged-in-container.module.css';

// Distance (in px) from the bottom of the pane at which we consider the user to have
// "scrolled to the bottom" and trigger a fetch of the next page of root pages.
const LOAD_MORE_THRESHOLD_PX = 48;

export function LoggedInContainer() {
  const { isLoading, data: rootPagesTree, isLoadingMore, hasMore, loadMore, error, mutate } = usePagesTree();
  const scrollPaneReference = useRef<HTMLDivElement>(null);

  // Lazily fetch additional root pages as the user actually scrolls to the bottom of the pane,
  // rather than eagerly loading whenever a "load more" marker happens to be within the pane's
  // bounds (which would keep auto-loading everything on mount for short lists, defeating the
  // purpose of paginating/lazy-loading in the first place).
  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasMore) {
        return;
      }

      const pane = event.currentTarget;
      const distanceFromBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
      if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
        loadMore();
      }
    },
    [hasMore, loadMore]
  );

  return (
    <Box>
      <Group justify="space-between" mb="sm">
        <Title order={3}>Pages</Title>
        <ActionIcon variant="subtle" size="sm" component={Link} href="/pages/create" aria-label="Add page">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      {isLoading && <Loader size="sm" />}
      {!isLoading && !rootPagesTree && error && (
        <Group justify="center" py="sm">
          <Text size="xs" c="red">
            Failed to load pages —{' '}
            <Anchor size="xs" component="button" type="button" onClick={() => mutate()}>
              retry
            </Anchor>
          </Text>
        </Group>
      )}
      {!isLoading && rootPagesTree && (
        <Box
          className={styles['scrollPane']}
          ref={scrollPaneReference}
          onScroll={handleScroll}
          data-testid="pages-tree-scroll-pane"
        >
          <PagesTree branches={rootPagesTree.branches} />
          {hasMore && <div data-testid="pages-tree-load-more-sentinel" />}
          {isLoadingMore && (
            <Group justify="center" py="sm">
              <Loader size="xs" />
            </Group>
          )}
          {!isLoadingMore && error && (
            <Group justify="center" py="sm">
              <Text size="xs" c="red">
                Failed to load more —{' '}
                <Anchor size="xs" component="button" type="button" onClick={() => mutate()}>
                  retry
                </Anchor>
              </Text>
            </Group>
          )}
        </Box>
      )}
    </Box>
  );
}
