'use client';

import { Alert, Box, Button, Container, Group, Loader, Modal, Stack, Tabs, Text, Title } from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { usePageDetails } from '@/lib/hooks/api/use-page-details';
import { PageDetailEditor } from '@/components/organisms/page-detail-editor';
import { Block } from '@blocknote/core';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { SetPageBlocksBody } from '@/types/api/endpoints/set-page-blocks';
import { IconPlus } from '@tabler/icons-react';
import { ViewCreator } from '@/components/organisms/view-creator';
import { DataViewRender } from '@/components/organisms/data-view-render';
import { GetDataViewsResponse } from '@/types/api';
import { useSearchParams } from 'next/navigation';

export default function PageDetailsPage() {
  const parameters = useParams();
  const pageId = `${parameters['id']}`;

  const router = useRouter();
  const searchParameters = useSearchParams();

  const selectedView = searchParameters.get('v') ?? 'contents';

  const { data: pageDetails, isLoading, error, mutate } = usePageDetails(pageId);

  const [showCreateViewForm, setShowCreateViewForm] = useState(false);

  const { post } = useCudApi();

  // Auto-select first view if views exist and no view is selected
  useEffect(() => {
    if (pageDetails?.views && pageDetails.views.length > 0 && !searchParameters.get('v')) {
      const firstView = pageDetails.views[0];
      if (firstView) {
        router.replace(`?v=${firstView.id}`);
      }
    }
  }, [pageDetails, searchParameters, router]);

  const updateBlocks = useCallback(
    async (blocks: Block[]) => {
      if (!pageId) {
        return;
      }

      await post<unknown, SetPageBlocksBody>(`/pages/${pageId}/blocks`, { blocks });
    },
    [pageId, post]
  );

  const doViewCreated = useCallback(
    async (view: GetDataViewsResponse[number]) => {
      setShowCreateViewForm(false);
      mutate();

      router.replace(`?v=${view.id}`);
    },
    [mutate, router]
  );

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
            <Title order={1}>{pageDetails?.page.name ?? <Loader />}</Title>
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
