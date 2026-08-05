'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Box } from '@mantine/core';
import { TreeNode } from './tree-node';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { usePageUrl } from '@/lib/hooks/use-page-url';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { revalidateWorkspacePageData } from '@/lib/swr/revalidate-workspace-page-data';
import { extractPageId } from '@/lib/utils/page-url';
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
  const getPageUrl = usePageUrl();

  const handleDelete = useCallback(
    async ({
      id,
      name,
      isView,
      parentPageId,
      parentPageName,
    }: {
      id: string;
      name: string;
      isView: boolean;
      parentPageId?: string;
      parentPageName?: string;
    }) => {
      try {
        // For a page deletion, determine — before the delete request removes it — whether the
        // currently viewed page is the page being deleted or nested beneath it (a cascade-deleted
        // descendant), so we know to navigate away. Routes are flat (`/pages/[id]`), so a
        // descendant can't be detected from the pathname alone; the breadcrumb ancestor chain is
        // fetched instead. Failures here are non-fatal — worst case we skip the redirect.
        let shouldRedirectAwayFromPage = false;
        if (!isView) {
          const currentPageIdMatch = /^\/[^/]+\/pages\/([^/]+)$/.exec(pathname);
          const currentPageRouteId = currentPageIdMatch?.[1];
          const currentPageId = currentPageRouteId ? extractPageId(currentPageRouteId) : undefined;
          if (currentPageId === id) {
            shouldRedirectAwayFromPage = true;
          } else if (currentPageId) {
            try {
              const response = await api.pages.getBreadcrumbs(currentPageId);
              shouldRedirectAwayFromPage = response.data.data.some((breadcrumb) => breadcrumb.id === id);
            } catch {
              shouldRedirectAwayFromPage = false;
            }
          }
        }

        await (isView ? api.views.remove(id) : api.pages.remove(id));

        await revalidateWorkspacePageData(workspaceId, parentPageId);

        if (isView && parentPageId && searchParameters.get('v') === id) {
          router.replace(getPageUrl({ id: parentPageId, name: parentPageName }));
        }

        if (shouldRedirectAwayFromPage) {
          router.push(`/${workspaceSlug}/pages`);
        }

        showSuccess(`Moved "${name}" to Trash`);
      } catch {
        showError(`Failed to delete "${name}"`);
      }
    },
    [pathname, router, searchParameters, showError, showSuccess, workspaceId, workspaceSlug, getPageUrl]
  );

  if (!branches || branches.length === 0) {
    return (
      <Box p="md" style={{ color: 'var(--mantine-color-dimmed)' }}>
        No pages found
      </Box>
    );
  }

  // Manual reordering (THOTH-036) — only child pages within an expanded root branch are
  // sortable, never the root branches themselves (permanently out of scope). `parentId` here is
  // always the immediate root branch's page id (deeper nesting isn't shown in the sidebar).
  const handleReorderChildren = async (
    parentId: string,
    movedId: string,
    beforeId: string | null,
    afterId: string | null
  ) => {
    await api.pages.reorder(movedId, { beforeId, afterId });
    await revalidateWorkspacePageData(workspaceId, parentId);
  };

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
          onReorderChildren: handleReorderChildren,
        };
        return <TreeNode key={branch.page.id} {...treeNodeProperties} />;
      })}
    </Box>
  );
}
