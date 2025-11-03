'use client';

import { Alert, Box, Button, Container, Group, Loader, Modal, Stack, Tabs, Text, Title } from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageDetails } from '@/lib/hooks/api/use-page-details';
import { PageDetailEditor } from '@/components/organisms/page-detail-editor';
import { Block } from '@blocknote/core';
import { IconPlus } from '@tabler/icons-react';
import { ViewCreator } from '@/components/organisms/view-creator';
import { DataViewRender } from '@/components/organisms/data-view-render';
import { GetDataViewsResponse } from '@/types/api';
import { useSearchParams } from 'next/navigation';
import { useUpdatePage } from '@/lib/hooks/api/use-update-page';
import { useSetPageBlocks } from '@/lib/hooks/api/use-set-page-blocks';
import { useNotification } from '@/lib/hooks/use-notification';
import styles from './page.module.css';

export default function PageDetailsPage() {
  const parameters = useParams();
  const pageId = `${parameters['id']}`;

  const router = useRouter();
  const searchParameters = useSearchParams();

  const selectedView = searchParameters.get('v') ?? 'contents';

  const { data: pageDetails, isLoading, error, mutate } = usePageDetails(pageId);

  const [showCreateViewForm, setShowCreateViewForm] = useState(false);
  const titleReference = useRef<HTMLHeadingElement>(null);

  const { showError } = useNotification();
  const { updatePage } = useUpdatePage({ mutatePageDetails: mutate });
  const { setPageBlocks } = useSetPageBlocks({ mutatePageDetails: mutate });

  // Auto-select first view if views exist and no view is selected
  useEffect(() => {
    if (pageDetails?.views && pageDetails.views.length > 0 && !searchParameters.get('v')) {
      const firstView = pageDetails.views[0];
      if (firstView) {
        router.replace(`?v=${firstView.id}`);
      }
    }
  }, [pageDetails, searchParameters, router]);

  // Sync the contentEditable title when pageDetails changes (e.g., after update)
  useEffect(() => {
    if (titleReference.current && pageDetails?.page.name && document.activeElement !== titleReference.current) {
      titleReference.current.textContent = pageDetails.page.name;
    }
  }, [pageDetails?.page.name]);

  const updateBlocks = useCallback(
    async (blocks: Block[]) => {
      if (!pageId) {
        return;
      }

      try {
        await setPageBlocks(pageId, blocks);
      } catch {
        showError('Failed to update page content');
      }
    },
    [pageId, setPageBlocks, showError]
  );

  const doViewCreated = useCallback(
    async (view: GetDataViewsResponse[number]) => {
      setShowCreateViewForm(false);
      mutate();

      router.replace(`?v=${view.id}`);
    },
    [mutate, router]
  );

  const handleTitleBlur = useCallback(
    async (event: React.FocusEvent<HTMLHeadingElement>) => {
      if (!pageDetails || !pageId) {
        return;
      }

      const newName = event.currentTarget.textContent?.trim() ?? '';
      const originalName = pageDetails.page.name;

      // Only update if the name actually changed
      if (newName === originalName || newName === '') {
        // Restore original name if empty
        if (newName === '' && titleReference.current) {
          titleReference.current.textContent = originalName;
        }
        return;
      }

      try {
        await updatePage(pageId, { name: newName });
      } catch {
        // Restore original name on error
        if (titleReference.current) {
          titleReference.current.textContent = originalName;
        }
        showError('Failed to update page name');
      }
    },
    [pageDetails, pageId, updatePage, showError]
  );

  const handleTitleKeyDown = useCallback((event: React.KeyboardEvent<HTMLHeadingElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      // Enter alone: confirm the value (blur the element)
      event.preventDefault();
      event.currentTarget.blur();
    }
  }, []);

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <Loader />
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Error">
          {error}
        </Alert>
      </Container>
    );
  }

  if (!pageDetails) {
    return (
      <Container size="md" py="xl">
        <Text>Page not found.</Text>
      </Container>
    );
  }

  return (
    <>
      <Container size="md" py="xl">
        <Box className="is-pulled-right">
          <Button size="xs" variant="default" onClick={() => setShowCreateViewForm(true)} leftSection={<IconPlus />}>
            Add View
          </Button>
        </Box>
        <Stack gap="lg">
          <Group gap="sm">
            <Text size="xl">{pageDetails?.page.emoji}</Text>
            <Title
              ref={titleReference}
              order={1}
              contentEditable
              suppressContentEditableWarning
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className={styles['editableTitle'] ?? ''}
            >
              {pageDetails?.page.name ?? <Loader />}
            </Title>
          </Group>
          <Tabs value={selectedView} onChange={(value) => router.replace(`?v=${value}`)}>
            <Tabs.List>
              {pageDetails.views?.map((view) => (
                <Tabs.Tab key={view.id} value={view.id}>
                  {view.name}
                </Tabs.Tab>
              ))}
              <Tabs.Tab value="contents">Contents</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="contents">
              <PageDetailEditor initialContent={pageDetails.blocks ?? []} onUpdate={updateBlocks} />
            </Tabs.Panel>

            {pageDetails.views?.map((view) => (
              <Tabs.Panel key={view.id} value={view.id}>
                <DataViewRender view={view} />
              </Tabs.Panel>
            ))}
          </Tabs>
        </Stack>
      </Container>
      {showCreateViewForm && (
        <Modal opened onClose={() => setShowCreateViewForm(false)} title="Create View" centered size="lg">
          <ViewCreator pageId={pageId} onCreated={doViewCreated} />
        </Modal>
      )}
    </>
  );
}
