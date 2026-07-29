import { PagesTree } from './pages-tree';
import { Box, Text } from '@mantine/core';
import { usePagesByRecent } from '@/lib/hooks/api/use-pages';
import type { GetPagesTreeResponse } from '@/types/api';

// Thin wrapper reusing `PagesTree`/`TreeNode` so no duplicate tree-rendering logic is needed.
// Mirrors `FavoritesTree`. Recent is rendered as flat leaf-style rows without their own nested
// child/view previews, since `GET /pages?recent=true` doesn't return that data.
export function RecentTree() {
  const { data: recentPages, error, isLoading, mutate } = usePagesByRecent();

  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <Box p="md" style={{ color: 'var(--mantine-color-red-6)' }}>
        <Text size="xs">
          Failed to load recent pages —{' '}
          <Text
            component="button"
            type="button"
            size="xs"
            c="red"
            style={{ textDecoration: 'underline', cursor: 'pointer' }}
            onClick={() => mutate()}
          >
            retry
          </Text>
        </Text>
      </Box>
    );
  }

  if (!recentPages || recentPages.length === 0) {
    return (
      <Box p="md" style={{ color: 'var(--mantine-color-dimmed)' }}>
        No recent pages
      </Box>
    );
  }

  const branches: GetPagesTreeResponse['branches'] = recentPages.map((recentPage) => ({
    page: recentPage.page,
    children: [],
    views: [],
  }));

  return (
    <Box>
      <PagesTree branches={branches} />
    </Box>
  );
}
