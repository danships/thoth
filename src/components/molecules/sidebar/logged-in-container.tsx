'use client';
import { PagesTree } from '../pages-tree';
import { usePagesTree } from '@/lib/hooks/api/use-pages-tree';
import { ActionIcon, Box, Group, Loader, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';

export function LoggedInContainer() {
  const { isLoading, data: rootPagesTree } = usePagesTree();

  return (
    <Box>
      <Group justify="space-between" mb="sm">
        <Title order={3}>Pages</Title>
        <ActionIcon variant="subtle" size="sm" component={Link} href="/pages/create" aria-label="Add page">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      {isLoading && <Loader size="sm" />}
      {!isLoading && rootPagesTree && <PagesTree branches={rootPagesTree.branches} />}
    </Box>
  );
}
