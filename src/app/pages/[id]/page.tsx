'use client';

import { Alert, Box, Button, Container, Group, Loader, Modal, Stack, Tabs, Text, Title } from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageDetails } from '@/lib/hooks/api/use-page-details';
import { PageDetailEditor } from '@/components/organisms/page-detail-editor';
import { PageFieldsEditor } from '@/components/organisms/page-fields-editor';
import { Block } from '@blocknote/core';
import { IconPlus } from '@tabler/icons-react';
import { ViewCreator } from '@/components/organisms/view-creator';
import { DataViewRender } from '@/components/organisms/data-view-render';
import { GetDataViewsResponse } from '@/types/api';
import { useSearchParams } from 'next/navigation';
import { useUpdatePage } from '@/lib/hooks/api/use-update-page';
import { useSetPageBlocks } from '@/lib/hooks/api/use-set-page-blocks';
import { useNotification } from '@/lib/hooks/use-notification';
import { usePageBreadcrumbs } from '@/lib/hooks/api/use-page-breadcrumbs';
import { PageBreadcrumb } from '@/components/molecules/page-breadcrumb';
import styles from './page.module.css';

export default function PageDetailsPage() {
  const parameters = useParams();
  const pageId = `${parameters['id']}`;

  const router = useRouter();
  const searchParameters = useSearchParams();

  const selectedView = searchParameters.get('v') ?? 'contents';

  const { data: pageDetails, isLoading, error, mutate } = usePageDetails(pageId);
  const { data: breadcrumbs, isLoading: isLoadingBreadcrumbs } = usePageBreadcrumbs(pageId);

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
      <Container size="md" py={{ base: 'sm', sm: 'xl' }} px={{ base: 'sm', sm: 'md' }}>
        <Loader />
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="md" py={{ base: 'sm', sm: 'xl' }} px={{ base: 'sm', sm: 'md' }}>
        <Alert color="red" title="Error">
          {error instanceof Error ? error.message : String(error)}
        </Alert>
      </Container>
    );
  }

  if (!pageDetails) {
    return (
      <Container size="md" py={{ base: 'sm', sm: 'xl' }} px={{ base: 'sm', sm: 'md' }}>
        <Text>Page not found.</Text>
      </Container>
    );
  }

  return (
    <>
      <Container size="md" py={{ base: 'sm', sm: 'xl' }} px={{ base: 'sm', sm: 'md' }}>
        <Stack gap="lg">
          {/* Uses a flex Group instead of the `is-pulled-right` float utility: a floated
              element causes any following block-level box that establishes its own formatting
              context (like this flex Stack) to shrink-to-fit the space beside the float instead
              of filling the container, which visibly shrank the whole page on narrow/mobile
              viewports where little space remained beside the float. */}
          <Group justify="flex-end">
            <Button size="xs" variant="default" onClick={() => setShowCreateViewForm(true)} leftSection={<IconPlus />}>
              Add View
            </Button>
          </Group>
          {!isLoadingBreadcrumbs && breadcrumbs && breadcrumbs.length > 1 && <PageBreadcrumb pages={breadcrumbs} />}
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
          {pageDetails.columns && pageDetails.columns.length > 0 && (
            <PageFieldsEditor
              pageId={pageId}
              dataSourceId={pageDetails.page.parentId}
              columns={pageDetails.columns}
              values={pageDetails.values}
              mutatePageDetails={mutate}
            />
          )}
          <Box className={styles['tabsWrapper'] ?? ''}>
            <Tabs
              value={selectedView}
              onChange={(value) => router.replace(`?v=${value}`)}
              className={styles['tabs'] ?? ''}
            >
              <Tabs.List>
                {pageDetails.views?.map((view) => (
                  <Tabs.Tab key={view.id} value={view.id}>
                    {view.name}
                  </Tabs.Tab>
                ))}
                <Tabs.Tab value="contents">Contents</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="contents" className={styles['tabsPanel'] ?? ''}>
                <PageDetailEditor initialContent={pageDetails.blocks ?? []} onUpdate={updateBlocks} />
              </Tabs.Panel>

              {pageDetails.views?.map((view) => (
                <Tabs.Panel key={view.id} value={view.id} className={styles['tabsPanel'] ?? ''}>
                  <DataViewRender view={view} />
                </Tabs.Panel>
              ))}
            </Tabs>
          </Box>
        </Stack>
      </Container>
      {showCreateViewForm && (
        <Modal
          opened
          onClose={() => setShowCreateViewForm(false)}
          title="Create View"
          centered
          size="lg"
          closeButtonProps={{ 'aria-label': 'Close' }}
        >
          <ViewCreator pageId={pageId} onCreated={doViewCreated} />
        </Modal>
      )}
    </>
  );
}
