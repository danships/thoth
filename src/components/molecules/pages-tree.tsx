'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Box } from '@mantine/core';
import { TreeNode } from './tree-node';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { revalidateWorkspacePageData } from '@/lib/swr/revalidate-workspace-page-data';
import type { GetPagesTreeResponse } from '@/types/api';

type PagesTreeProperties = {
  branches: GetPagesTreeResponse['branches'];
};

export function PagesTree({ branches }: PagesTreeProperties) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParameters = useSearchParams();
  const { id: workspaceId, slug: workspaceSlug } = useCurrentWorkspace();
  const { showError, showSuccess } = useNotification();

  const handleDelete = useCallback(
    async ({
      id,
      name,
      isView,
      parentPageId,
    }: {
      id: string;
      name: string;
      isView: boolean;
      parentPageId?: string;
    }) => {
      try {
        await (isView ? api.views.remove(id) : api.pages.remove(id));

        await revalidateWorkspacePageData(workspaceId, parentPageId);

        if (isView && parentPageId && searchParameters.get('v') === id) {
          router.replace(`/${workspaceSlug}/pages/${parentPageId}`);
        }

        if (!isView && pathname.startsWith(`/${workspaceSlug}/pages/${id}`)) {
          router.push(`/${workspaceSlug}/pages`);
        }

        showSuccess(isView ? `Moved "${name}" to Trash` : `Moved "${name}" to Trash`);
      } catch {
        showError(isView ? `Failed to delete "${name}"` : `Failed to delete "${name}"`);
      }
    },
    [pathname, router, searchParameters, showError, showSuccess, workspaceId, workspaceSlug]
  );

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
          ...(branch.hasMoreChildren && { hasMoreChildren: true }),
          ...(branch.views && {
            views: branch.views.map((view) => ({ id: view.id, name: view.name })),
          }),
          onDelete: handleDelete,
        };
        return <TreeNode key={branch.page.id} {...treeNodeProperties} />;
      })}
    </Box>
  );
}
