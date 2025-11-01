import { TreeNode } from './tree-node';
import { Box } from '@mantine/core';
import type { GetPagesTreeResponse } from '@/types/api';

interface PagesTreeProperties {
  branches: GetPagesTreeResponse['branches'];
}

export function PagesTree({ branches }: PagesTreeProperties) {
  if (!branches || branches.length === 0) {
    return (
      <Box p="md" style={{ color: 'var(--mantine-color-dimmed)' }}>
        No pages found
      </Box>
    );
  }

  return (
    <Box>
      {branches.map((branch) => {
        const treeNodeProperties = {
          page: branch.page,
          childPages: branch.children,
          ...(branch.views && {
            views: branch.views.map((view) => ({ id: view.id, name: view.name })),
          }),
        };
        return <TreeNode key={branch.page.id} {...treeNodeProperties} />;
      })}
    </Box>
  );
}
