'use client';

import { Alert, Badge, Card, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/provider';
import { $currentPage, $currentPageId } from '@/lib/store/query/get-page-details';

export default function PageDetailsPage() {
  const { user } = useAuth();
  const parameters = useParams();
  const pageId = parameters.id as string;

  const { data: page, loading, error } = useStore($currentPage);

  useEffect(() => {
    if (pageId) {
      $currentPageId.set(pageId);
    } else {
      $currentPageId.set('');
    }
    return () => $currentPageId.set(null);
  }, [pageId]);

  if (!user) {
    return (
      <Container size="md" py="xl">
        <Text>Please log in to view pages.</Text>
      </Container>
    );
  }

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
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <Text size="xl">{page?.page.emoji}</Text>
          <Title order={1}>{page?.page.name ?? <Loader />}</Title>
        </Group>

        <Card p="md" withBorder>
          <Stack gap="sm">
            <Group gap="xs">
              <Badge variant="light">Type</Badge>
              <Text>{page?.page.type}</Text>
            </Group>
            <Group gap="xs">
              <Badge variant="light">Created</Badge>
              <Text>{page?.page.createdAt ? new Date(page.page.createdAt).toLocaleString() : ''}</Text>
            </Group>
            <Group gap="xs">
              <Badge variant="light">Last Updated</Badge>
              <Text>{page?.page.lastUpdated ? new Date(page.page.lastUpdated).toLocaleString() : ''}</Text>
            </Group>
            {page?.page.parentId && (
              <Group gap="xs">
                <Badge variant="light">Parent</Badge>
                <Text>{page.page.parentId}</Text>
              </Group>
            )}
          </Stack>
        </Card>

        <Card p="md" withBorder>
          <Text c="dimmed">Page content will go here...</Text>
        </Card>
      </Stack>
    </Container>
  );
}
