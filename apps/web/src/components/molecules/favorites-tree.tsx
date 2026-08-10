import { PagesTree } from './pages-tree';
import { Box, Text } from '@mantine/core';
import { usePagesByFavorited } from '@/lib/hooks/api/use-pages';
import { FAVORITES_MAX_LIMIT, type GetPagesTreeResponse } from '@/types/api';

// Thin wrapper reusing `PagesTree`/`TreeNode` so no duplicate tree-rendering logic is needed.
// Favorites are rendered as flat leaf-style rows without their own nested child/view
// previews, since `GET /pages?favorited=true` doesn't return that data.
export function FavoritesTree() {
  const { data: favorites, error, isLoading, mutate } = usePagesByFavorited();

  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <Box p="md" style={{ color: 'var(--mantine-color-red-6)' }}>
        <Text size="xs">
          Failed to load favorites —{' '}
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

  if (!favorites || favorites.length === 0) {
    return (
      <Box p="md" style={{ color: 'var(--mantine-color-dimmed)' }}>
        No favorites yet
      </Box>
    );
  }

  const branches: GetPagesTreeResponse['branches'] = favorites.map((favorite) => ({
    page: favorite.page,
    children: [],
    views: [],
  }));

  return (
    <Box>
      <PagesTree branches={branches} />
      {favorites.length === FAVORITES_MAX_LIMIT && (
        <Text size="xs" c="dimmed" px="md" py="xs">
          Showing the first {FAVORITES_MAX_LIMIT} favorites — there may be more.
        </Text>
      )}
    </Box>
  );
}
