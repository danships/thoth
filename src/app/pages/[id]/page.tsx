'use client';

import { Alert, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { $currentPage, $currentPageId } from '@/lib/store/query/get-page-details';
import { PageDetailEditor } from '@/components/organisms/page-detail-editor';
import { $currentPageBlocks, $currentPageBlocksId } from '@/lib/store/query/get-page-blocks';
import { Block } from '@blocknote/core';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { SetPageBlocksBody } from '@/types/api/endpoints/set-page-blocks';

export default function PageDetailsPage() {
  const parameters = useParams();
  const pageId = `${parameters['id']}`;

  const { data: page, loading, error } = useStore($currentPage);
  const { data: pageBlocks } = useStore($currentPageBlocks);

  useEffect(() => {
    if (pageId) {
      $currentPageId.set(pageId);
      $currentPageBlocksId.set(pageId);
    } else {
      $currentPageId.set(null);
      $currentPageBlocksId.set(null);
    }
    return () => {
      $currentPageId.set(null);
      $currentPageBlocksId.set(null);
    };
  }, [pageId]);

  const { post } = useCudApi();

  const updateBlocks = useCallback(
    async (blocks: Block[]) => {
      if (!pageId) {
        return;
      }

      await post<unknown, SetPageBlocksBody>(`/pages/${pageId}/blocks`, { blocks });
    },
    [pageId, post]
  );

  if (loading) {
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

  if (!page) {
    return (
      <Container size="md" py="xl">
        <Text>Page not found.</Text>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl" h="100vh">
      <Stack gap="lg" h="100vh">
        <Group gap="sm">
          <Text size="xl">{page?.page.emoji}</Text>
          <Title order={1}>{page?.page.name ?? <Loader />}</Title>
        </Group>

        {pageBlocks && <PageDetailEditor initialContent={pageBlocks.blocks} onUpdate={updateBlocks} />}
      </Stack>
    </Container>
  );
}
