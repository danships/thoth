'use client';

import { useCallback } from 'react';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { buildPageUrlId } from '@/lib/utils/page-url';

/**
 * Returns a stable `getPageUrl` function that builds the canonical page detail URL for the
 * current workspace: `/{workspaceSlug}/pages/{titleSlug}-{id}` (THOTH-067), falling back to the
 * bare `/{workspaceSlug}/pages/{id}` when no usable name is supplied. Use this everywhere a page
 * detail link is generated/navigated to, instead of hand-building the path, so every entry point
 * stays consistent.
 */
export function usePageUrl() {
  const { slug: workspaceSlug } = useCurrentWorkspace();

  return useCallback(
    (page: { id: string; name?: string | null | undefined }) =>
      `/${workspaceSlug}/pages/${buildPageUrlId(page.id, page.name)}`,
    [workspaceSlug]
  );
}
