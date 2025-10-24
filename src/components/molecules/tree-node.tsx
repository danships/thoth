import { ActionIcon, Box } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { IconPlus } from '@tabler/icons-react';
import { computed } from 'nanostores';
import Link from 'next/link';
import { $expandedPages, togglePageExpanded } from '@/lib/store/tree-expanded-state';
import { TreeItem } from '../atoms/tree-item';
import { TreeToggle } from '../atoms/tree-toggle';

type TreeNodeProperties = {
  page: {
    id: string;
    name: string;
    emoji?: string | null;
  };
  childPages?: Array<{
    page: {
      id: string;
      name: string;
      emoji?: string | null;
    };
  }>;
  level?: number;
};

export function TreeNode({ page, childPages = [], level = 0 }: TreeNodeProperties) {
  const $isExpanded = computed($expandedPages, (expandedPages) => expandedPages.get(page.id) ?? false);

  const isExpanded = useStore($isExpanded);

  const hasChildren = childPages.length > 0;

  const handleToggle = () => {
    togglePageExpanded(page.id);
  };

  return (
    <Box>
      {/* Current page row */}
      <Box
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: level * 20,
        }}
      >
        <TreeToggle isExpanded={isExpanded} onToggle={handleToggle} hasChildren={hasChildren} />
        <TreeItem name={page.name} emoji={page.emoji ?? null} to={`/pages/${page.id}`} />
        <ActionIcon
          variant="subtle"
          size="xs"
          component={Link}
          href={`/pages/${page.id}/create`}
          aria-label="Add child page"
          style={{ marginLeft: 'auto' }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <IconPlus size={12} />
        </ActionIcon>
      </Box>

      {/* Children */}
      {isExpanded && hasChildren && (
        <Box>
          {childPages.map((child) => (
            <TreeNode
              key={child.page.id}
              page={{
                id: child.page.id,
                name: child.page.name,
                emoji: child.page.emoji ?? null,
              }}
              level={level + 1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
