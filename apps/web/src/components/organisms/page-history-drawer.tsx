'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useRouter } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { swrFetcher } from '@/lib/swr/fetcher';
import { usePageRevision } from '@/lib/hooks/api/use-page-revision';
import { useRestorePageRevision } from '@/lib/hooks/api/use-restore-page-revision';
import { useForkPageRevision } from '@/lib/hooks/api/use-fork-page-revision';
import { useNotification } from '@/lib/hooks/use-notification';
import { MarkdownDiffView } from '@/components/molecules/markdown-diff-view';
import { ValuesDiffView } from '@/components/molecules/values-diff-view';
import {
  GET_PAGE_HISTORY_ENDPOINT,
  type GetPageDetailsResponse,
  type GetPageHistoryResponse,
  type PageHistoryRevisionSummary,
} from '@/types/api';
import { usePageUrl } from '@/lib/hooks/use-page-url';
import styles from './page-history-drawer.module.css';

// Accumulates cursor-paginated pages of the history list into one flat timeline for the
// drawer. Kept local to the drawer (rather than in `use-page-history.ts`) since the "load
// more" pagination shape is a drawer-only concern; `usePageHistory` itself stays a plain
// single-page SWR read for any other consumer.
function usePageHistoryPaged(pageId: string | null, target: 'all' | 'content' | 'values') {
  const getKey = (pageIndex: number, previousPageData: GetPageHistoryResponse | null) => {
    if (!pageId) {
      return null;
    }
    if (previousPageData && !previousPageData.nextCursor) {
      return null;
    }
    const cursor = pageIndex === 0 ? null : (previousPageData?.nextCursor ?? null);
    const searchParameters = new URLSearchParams({ target });
    if (cursor) {
      searchParameters.set('cursor', cursor);
    }
    return `${GET_PAGE_HISTORY_ENDPOINT.replace(':id', pageId)}?${searchParameters.toString()}`;
  };

  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<GetPageHistoryResponse>(getKey, swrFetcher);

  const revisions = (data ?? []).flatMap((page) => page.revisions);
  const nextCursor = data && data.length > 0 ? (data.at(-1)?.nextCursor ?? null) : null;

  return { revisions, nextCursor, isLoading, error, size, setSize, mutate };
}

type PageHistoryDrawerProperties = {
  pageId: string;
  opened: boolean;
  onClose: () => void;
  mutatePageDetails: (
    updateFunction?: (previous: GetPageDetailsResponse | undefined) => GetPageDetailsResponse | undefined,
    options?: { revalidate: boolean }
  ) => void;
};

function targetLabel(target: PageHistoryRevisionSummary['target']) {
  return target === 'content' ? 'Content' : 'Values';
}

function revisionSummaryLabel(revision: PageHistoryRevisionSummary) {
  if (revision.target === 'values') {
    return revision.changedColumns && revision.changedColumns.length > 0
      ? `${revision.changedColumns.length} column${revision.changedColumns.length === 1 ? '' : 's'} changed`
      : 'Values changed';
  }
  return `+${revision.charsAdded} / -${revision.charsRemoved}`;
}

// Right-side history drawer for a page: a merged, cursor-paginated timeline across the
// content and values revision streams, with a target filter, a diff panel for the selected
// revision, and Restore/Fork actions. See THOTH-043.
export function PageHistoryDrawer({ pageId, opened, onClose, mutatePageDetails }: PageHistoryDrawerProperties) {
  const [target, setTarget] = useState<'all' | 'content' | 'values'>('all');
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [forkModalOpened, setForkModalOpened] = useState(false);
  const [forkName, setForkName] = useState('');

  const router = useRouter();
  const getPageUrl = usePageUrl();
  const { showError, showSuccess } = useNotification();

  const {
    revisions,
    nextCursor,
    isLoading: isLoadingHistory,
    size,
    setSize,
    mutate: mutateHistory,
  } = usePageHistoryPaged(opened ? pageId : null, target);

  const { data: revision, isLoading: isLoadingRevision } = usePageRevision(pageId, opened ? selectedRevisionId : null);
  const { restoreRevision, inProgress: isRestoring } = useRestorePageRevision({ mutatePageDetails });
  const { forkRevision, inProgress: isForking } = useForkPageRevision();

  const handleClose = () => {
    setSelectedRevisionId(null);
    onClose();
  };

  const handleRestore = () => {
    if (!selectedRevisionId) {
      return;
    }
    modals.openConfirmModal({
      title: 'Restore this revision?',
      children: (
        <Text size="sm">
          The current {revision?.target === 'values' ? 'column values' : 'content'} will be replaced with this
          revision&apos;s state. This can&apos;t be undone, but restoring is itself recorded in the history.
        </Text>
      ),
      labels: { confirm: 'Restore', cancel: 'Cancel' },
      confirmProps: { color: 'orange' },
      onConfirm: async () => {
        try {
          await restoreRevision(pageId, selectedRevisionId);
          showSuccess('Revision restored');
          void mutateHistory();
          handleClose();
        } catch {
          showError('Failed to restore revision');
        }
      },
    });
  };

  const handleFork = async () => {
    if (!selectedRevisionId) {
      return;
    }
    try {
      const forked = await forkRevision(pageId, selectedRevisionId, forkName ? { name: forkName } : undefined);
      showSuccess('Created a new page from this revision');
      setForkModalOpened(false);
      setForkName('');
      handleClose();
      router.push(getPageUrl(forked));
    } catch {
      showError('Failed to create page from revision');
    }
  };

  return (
    <Drawer opened={opened} onClose={handleClose} position="right" size="lg" title="Page history">
      <Stack gap="md" className={styles['drawer']}>
        <SegmentedControl
          value={target}
          onChange={(value) => {
            setTarget(value as 'all' | 'content' | 'values');
            setSelectedRevisionId(null);
          }}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Content', value: 'content' },
            { label: 'Values', value: 'values' },
          ]}
        />

        <ScrollArea.Autosize mah={280} type="auto">
          <Stack gap={4}>
            {isLoadingHistory && <Loader size="sm" />}
            {!isLoadingHistory && revisions.length === 0 && (
              <Text c="dimmed" size="sm">
                No history recorded yet for this page.
              </Text>
            )}
            {revisions.map((entry) => (
              <UnstyledButton
                key={entry.id}
                onClick={() => setSelectedRevisionId(entry.id)}
                className={`${styles['revisionRow'] ?? ''} ${
                  entry.id === selectedRevisionId ? (styles['revisionRowSelected'] ?? '') : ''
                }`}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={0}>
                    <Text size="sm">{new Date(entry.createdAt).toLocaleString()}</Text>
                    <Text size="xs" c="dimmed">
                      {revisionSummaryLabel(entry)}
                    </Text>
                  </Stack>
                  <Group gap={4} wrap="nowrap">
                    <Badge size="sm" variant="light" color={entry.target === 'content' ? 'blue' : 'grape'}>
                      {targetLabel(entry.target)}
                    </Badge>
                    {entry.kind !== 'patch' && (
                      <Badge size="sm" variant="outline" color={entry.consolidated ? 'orange' : 'gray'}>
                        {entry.consolidated ? 'Consolidated' : 'Snapshot'}
                      </Badge>
                    )}
                  </Group>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>

        {nextCursor && (
          <Button variant="subtle" size="xs" onClick={() => setSize(size + 1)}>
            Load more
          </Button>
        )}

        <Divider />

        <Box className={styles['diffPanel']}>
          {!selectedRevisionId && (
            <Text c="dimmed" size="sm">
              Select a revision to view what changed in it.
            </Text>
          )}
          {selectedRevisionId && isLoadingRevision && <Loader size="sm" />}
          {selectedRevisionId && revision && revision.target === 'content' && (
            <>
              {revision.isFirstRevision && (
                <Text c="dimmed" size="sm" mb="sm">
                  This is the first recorded revision — shown in full.
                </Text>
              )}
              <MarkdownDiffView before={revision.previousContent} after={revision.content} />
            </>
          )}
          {selectedRevisionId && revision && revision.target === 'values' && (
            <>
              {revision.isFirstRevision && (
                <Text c="dimmed" size="sm" mb="sm">
                  This is the first recorded revision — shown in full.
                </Text>
              )}
              <ValuesDiffView before={revision.previousValues} after={revision.values} columns={revision.columns} />
            </>
          )}
        </Box>

        {selectedRevisionId && revision && (
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setForkModalOpened(true)} disabled={isForking || isRestoring}>
              Create new page from this version
            </Button>
            <Button color="orange" onClick={handleRestore} loading={isRestoring} disabled={isForking}>
              Restore
            </Button>
          </Group>
        )}
      </Stack>

      <Modal
        opened={forkModalOpened}
        onClose={() => setForkModalOpened(false)}
        title="Create new page from this version"
      >
        <Stack gap="sm">
          <TextInput
            label="Page name"
            placeholder="Defaults to the current page's name + (copy)"
            value={forkName}
            onChange={(event) => setForkName(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setForkModalOpened(false)}>
              Cancel
            </Button>
            <Button onClick={handleFork} loading={isForking}>
              Create page
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
}
