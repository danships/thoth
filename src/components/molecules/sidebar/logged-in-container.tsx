'use client';
import { PagesTree } from '../pages-tree';
import { $rootPagesTree } from '@/lib/store/query/get-pages-tree';
import { ActionIcon, Box, Group, Loader, Title } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';

export function LoggedInContainer() {
  const { loading, data: rootPagesTree } = useStore($rootPagesTree);

  return (
    <Box>
      <Group justify="space-between" mb="sm">
        <Title order={3}>Pages</Title>
        <ActionIcon variant="subtle" size="sm" component={Link} href="/pages/create" aria-label="Add page">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      {loading && <Loader size="sm" />}
      {!loading && rootPagesTree && <PagesTree branches={rootPagesTree.branches} />}
    </Box>
  );
}
