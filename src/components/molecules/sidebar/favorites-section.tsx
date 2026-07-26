'use client';
import { ActionIcon, Group, Title } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { IconChevronDown, IconChevronRight, IconStarFilled } from '@tabler/icons-react';
import { FavoritesTree } from '../favorites-tree';
import { usePagesByFavorited } from '@/lib/hooks/api/use-pages';
import { $favoritesSectionExpanded, toggleFavoritesSection } from '@/lib/store/favorites-expanded-state';

export function FavoritesSection() {
  const isExpanded = useStore($favoritesSectionExpanded);
  const { data: favorites, isLoading } = usePagesByFavorited();

  // Hide the whole section once the favorites list has loaded and is empty, so users who've
  // never starred anything don't see a permanently-empty collapsible shell.
  if (!isLoading && (!favorites || favorites.length === 0)) {
    return null;
  }

  const hasFavorite = !!favorites && favorites.length > 0;

  return (
    <Group gap="sm" wrap="wrap" mb="sm" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <Group justify="space-between" w="100%">
        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleFavoritesSection}
            aria-label={isExpanded ? 'Collapse favorites' : 'Expand favorites'}
          >
            {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
          <Title order={3}>Favorites</Title>
          {hasFavorite && <IconStarFilled size={14} color="var(--mantine-color-yellow-6)" />}
        </Group>
      </Group>
      {isExpanded && <FavoritesTree />}
    </Group>
  );
}
