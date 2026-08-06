'use client';
import { ActionIcon, Box, Group, Title } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { IconChevronDown, IconChevronRight, IconClock } from '@tabler/icons-react';
import { RecentTree } from '../recent-tree';
import { $recentSectionExpanded, toggleRecentSection } from '@/lib/store/recent-expanded-state';

// Unlike `FavoritesSection`, the Recent section is never hidden — even for a brand-new
// workspace with no access history, the header always renders and `RecentTree` shows its
// muted "No recent pages" placeholder instead (per THOTH-035 product decision).
export function RecentSection() {
  const isExpanded = useStore($recentSectionExpanded);

  return (
    <Group gap="sm" wrap="wrap" mb="sm" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <Group justify="space-between" w="100%">
        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleRecentSection}
            aria-label={isExpanded ? 'Collapse recent' : 'Expand recent'}
          >
            {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
          <Title order={3}>Recent</Title>
          {/* Inherits the surrounding Title's color rather than a bespoke accent. */}
          <IconClock size={14} />
        </Group>
      </Group>
      {isExpanded && (
        <Box data-testid="recent-tree">
          <RecentTree />
        </Box>
      )}
    </Group>
  );
}
