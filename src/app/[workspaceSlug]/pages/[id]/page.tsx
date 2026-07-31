'use client';

import {
  Alert,
  ActionIcon,
  Box,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate as mutateGlobal } from 'swr';
import { usePageDetails } from '@/lib/hooks/api/use-page-details';
import { api } from '@/lib/api/client';
import { PageFieldsEditor } from '@/components/organisms/page-fields-editor';
import { IconPlus } from '@tabler/icons-react';
import { ViewCreator } from '@/components/organisms/view-creator';
import { DataViewRender } from '@/components/organisms/data-view-render';
import { GetDataViewsResponse } from '@/types/api';
import { useSearchParams } from 'next/navigation';
import { useUpdatePage } from '@/lib/hooks/api/use-update-page';
import { useSetPageContent } from '@/lib/hooks/api/use-set-page-content';
import { useNotification } from '@/lib/hooks/use-notification';
import { usePageBreadcrumbs } from '@/lib/hooks/api/use-page-breadcrumbs';
import { useRegisterPageAccess } from '@/lib/hooks/api/use-register-page-access';
import { useToggleFavorite } from '@/lib/hooks/api/use-toggle-page-favorite';
import { PageBreadcrumb } from '@/components/molecules/page-breadcrumb';
import { PageCoverEditor } from '@/components/molecules/page-cover-editor';
import { PageEmojiPicker } from '@/components/molecules/page-emoji-picker';
import { PageDetailMenu } from '@/components/organisms/page-detail-menu';
import { PageDetailEditor, type PageDetailEditorHandle } from '@/components/organisms/page-detail-editor';
import { PageSubpagesList } from '@/components/organisms/page-subpages-list';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { GET_PAGES_ENDPOINT, SUBPAGES_TAB_VALUE } from '@/types/api';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import styles from './page.module.css';

export default function PageDetailsPage() {
  const parameters = useParams();
  const pageId = `${parameters['id']}`;

  const router = useRouter();
  const searchParameters = useSearchParams();

  const selectedView = searchParameters.get('v') ?? 'contents';

  const { data: pageDetails, isLoading, error, mutate } = usePageDetails(pageId);
  const { data: breadcrumbs, isLoading: isLoadingBreadcrumbs } = usePageBreadcrumbs(pageId);

  const hasSubpages = pageDetails?.hasChildren ?? false;

  const [showCreateViewForm, setShowCreateViewForm] = useState(false);
  const titleReference = useRef<HTMLHeadingElement>(null);
  const editorReference = useRef<PageDetailEditorHandle>(null);

  const { showError } = useNotification();
  const { updatePage } = useUpdatePage({ mutatePageDetails: mutate });
  const { setPageContent } = useSetPageContent({ mutatePageDetails: mutate });
  const { registerAccess } = useRegisterPageAccess();
  const { toggleFavorite, inProgress: isTogglingFavorite } = useToggleFavorite({ mutatePageDetails: mutate });
  const { id: workspaceId, slug: workspaceSlug } = useCurrentWorkspace();

  // Explicitly register that this page was opened, once per navigation (guarded on `pageId`
  // alone so it doesn't re-fire on every re-render). Kept fully separate from `usePageDetails`
  // and any GET call so background prefetches/hover-preloads never silently reorder the
  // sidebar's root list.
  useEffect(() => {
    void (async () => {
      await registerAccess(pageId);
      // Best-effort: nudge the sidebar's Recent list to revalidate promptly so it reorders
      // without waiting for SWR's default focus/mount revalidation. Never blocks navigation.
      void mutateGlobal(`${GET_PAGES_ENDPOINT}?recent=true&workspaceId=${workspaceId}`);
    })();
  }, [pageId, registerAccess, workspaceId]);

  // Auto-select first view if views exist and no view is selected
  useEffect(() => {
    if (pageDetails?.views && pageDetails.views.length > 0 && !searchParameters.get('v')) {
      const firstView = pageDetails.views[0];
      if (firstView) {
        router.replace(`?v=${firstView.id}`);
      }
    }
  }, [pageDetails, searchParameters, router]);

  // Guard against a stale/hand-crafted `?v=subpages` when the page turns out to have no
  // direct children (e.g. its last child was deleted since the URL was bookmarked): redirect
  // back to Contents rather than rendering a missing panel.
  useEffect(() => {
    if (pageDetails && !hasSubpages && searchParameters.get('v') === SUBPAGES_TAB_VALUE) {
      router.replace('?v=contents');
    }
  }, [pageDetails, hasSubpages, searchParameters, router]);

  // Sync the contentEditable title when pageDetails changes (e.g., after update)
  useEffect(() => {
    if (titleReference.current && pageDetails?.page.name && document.activeElement !== titleReference.current) {
      titleReference.current.textContent = pageDetails.page.name;
    }
  }, [pageDetails?.page.name]);

  const updateContent = useCallback(
    async (content: string) => {
      if (!pageId) {
        return;
      }

      try {
        await setPageContent(pageId, content);
      } catch {
        showError('Failed to update page content');
      }
    },
    [pageId, setPageContent, showError]
  );

  // Imports a Markdown file's contents into the editor (see the "Import from Markdown" menu
  // action) and persists the normalised result through the same content-save flow as regular
  // edits. Throws if the editor hasn't mounted yet so the caller's error handling (and toast)
  // reflects the failed import instead of a false success.
  const handleImportMarkdown = useCallback(
    async (markdown: string) => {
      if (!editorReference.current || !pageId) {
        throw new Error('Editor is not ready to import markdown');
      }

      const normalizedMarkdown = await editorReference.current.replaceWithMarkdown(markdown);
      await setPageContent(pageId, normalizedMarkdown);
    },
    [pageId, setPageContent]
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

  const handleToggleFavorite = useCallback(async () => {
    if (!pageDetails || !pageId) {
      return;
    }

    try {
      await toggleFavorite(pageId, !pageDetails.starred);
    } catch {
      showError('Failed to update favorite status');
    }
  }, [pageDetails, pageId, toggleFavorite, showError]);

  const handleMoveToTrash = useCallback(async () => {
    try {
      await api.pages.remove(pageId);
      globalThis.location.assign(`/${workspaceSlug}/pages`);
    } catch {
      throw new Error('Failed to move page to Trash');
    }
  }, [pageId, workspaceSlug]);

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
          {!isLoadingBreadcrumbs && breadcrumbs && breadcrumbs.length > 1 && <PageBreadcrumb pages={breadcrumbs} />}
          <PageCoverEditor pageId={pageId} cover={pageDetails.page.cover} updatePage={updatePage} />
          <Group gap="sm">
            <PageEmojiPicker pageId={pageId} emoji={pageDetails.page.emoji} updatePage={updatePage} />
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
            <ActionIcon
              variant="subtle"
              size="lg"
              disabled={isTogglingFavorite}
              onClick={handleToggleFavorite}
              aria-label={pageDetails.starred ? 'Unstar page' : 'Star page'}
            >
              {pageDetails.starred ? (
                <IconStarFilled size={20} color="var(--mantine-color-yellow-6)" />
              ) : (
                <IconStar size={20} />
              )}
            </ActionIcon>
          </Group>
          <Group justify="flex-end">
            <PageDetailMenu
              pageId={pageId}
              hasContent={Boolean(pageDetails.content)}
              onImportMarkdown={handleImportMarkdown}
              onAddChildPage={() => router.push(`/${workspaceSlug}/pages/${pageId}/create`)}
              onMoveToTrash={handleMoveToTrash}
            />
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
              {/* The "Add View" button lives alongside the Tabs.List (rather than in its own
                  row at the top of the page, next to the title/breadcrumb) so it's visually
                  and contextually tied to the views it manages. `wrap="wrap"` lets the button
                  drop to its own line below the tab list on narrow viewports instead of
                  squeezing/overlapping the tabs or shrinking them to fit beside it. */}
              <Group justify="space-between" align="center" wrap="wrap" gap="xs" className={styles['tabsHeader'] ?? ''}>
                <Tabs.List className={styles['tabsList'] ?? ''}>
                  {pageDetails.views?.map((view) => (
                    <Tabs.Tab key={view.id} value={view.id}>
                      {view.name}
                    </Tabs.Tab>
                  ))}
                  {hasSubpages && <Tabs.Tab value={SUBPAGES_TAB_VALUE}>Sub Pages</Tabs.Tab>}
                  <Tabs.Tab value="contents">Contents</Tabs.Tab>
                </Tabs.List>
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setShowCreateViewForm(true)}
                  leftSection={<IconPlus />}
                >
                  Add View
                </Button>
              </Group>
              <Tabs.Panel value="contents" className={styles['tabsPanel'] ?? ''}>
                <PageDetailEditor
                  ref={editorReference}
                  key={pageId}
                  initialContent={pageDetails.content ?? ''}
                  onUpdate={updateContent}
                />
              </Tabs.Panel>

              {hasSubpages && (
                <Tabs.Panel value={SUBPAGES_TAB_VALUE} className={styles['tabsPanel'] ?? ''}>
                  {/* Only mounted while the tab is active (Mantine only renders the active
                      panel's children by default), so `usePagesByParent` fires lazily. */}
                  <PageSubpagesList pageId={pageId} />
                </Tabs.Panel>
              )}

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
