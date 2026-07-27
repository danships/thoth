import { ActionIcon, Box, Text } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { IconPlus } from '@tabler/icons-react';
import { computed } from 'nanostores';
import Link from 'next/link';
import { $expandedPages, togglePageExpanded } from '@/lib/store/tree-expanded-state';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
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
  // Set when the page has more children than the small inline preview allows (see
  // CHILD_PREVIEW_LIMIT). Child-listing pagination is out of scope for this ticket, so this
  // is a static indicator only — no additional fetching is triggered by scrolling/interacting.
  hasMoreChildren?: boolean;
  views?: Array<{
    id: string;
    name: string;
  }>;
  level?: number;
  parentPageId?: string;
  isView?: boolean;
};

export function TreeNode({
  page,
  childPages = [],
  hasMoreChildren = false,
  views = [],
  level = 0,
  parentPageId,
  isView,
}: TreeNodeProperties) {
  const $isExpanded = computed($expandedPages, (expandedPages) => expandedPages.get(page.id) ?? false);

  const isExpanded = useStore($isExpanded);
  const { slug: workspaceSlug } = useCurrentWorkspace();

  const hasChildren = childPages.length > 0 || views.length > 0;

  const handleToggle = () => {
    togglePageExpanded(page.id);
  };

  // Determine the link URL - if this is a view, link to parent page with view query param
  const getPageUrl = () => {
    if (isView && parentPageId) {
      return `/${workspaceSlug}/pages/${parentPageId}?v=${page.id}`;
    }
    return `/${workspaceSlug}/pages/${page.id}`;
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
        <TreeItem name={page.name} emoji={page.emoji ?? null} to={getPageUrl()} />
        {level === 0 && !isView && (
          <ActionIcon
            variant="subtle"
            size="xs"
            component={Link}
            href={`/${workspaceSlug}/pages/${page.id}/create`}
            aria-label="Add child page"
            style={{ marginLeft: 'auto' }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <IconPlus size={12} />
          </ActionIcon>
        )}
      </Box>

      {/* Views (shown as children when expanded) */}
      {isExpanded && views.length > 0 && (
        <Box>
          {views.map((view) => (
            <TreeNode
              key={view.id}
              page={{
                id: view.id,
                name: view.name,
                emoji: null,
              }}
              childPages={[]}
              views={[]}
              level={level + 1}
              parentPageId={page.id}
              isView={true}
            />
          ))}
        </Box>
      )}

      {/* Children (actual child pages) */}
      {isExpanded && childPages.length > 0 && (
        <Box>
          {childPages.map((child) => (
            <TreeNode
              key={child.page.id}
              page={{
                id: child.page.id,
                name: child.page.name,
                emoji: child.page.emoji ?? null,
              }}
              childPages={[]}
              views={[]}
              level={level + 1}
              parentPageId={page.id}
            />
          ))}
          {hasMoreChildren && (
            <Box style={{ paddingLeft: (level + 1) * 20 + 24 }}>
              <Text
                component={Link}
                href={`/${workspaceSlug}/pages/${page.id}`}
                size="xs"
                c="dimmed"
                style={{ display: 'block', textDecoration: 'none' }}
              >
                More inside — open page
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
