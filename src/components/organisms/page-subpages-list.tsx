'use client';

import { Alert, Loader, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { usePagesByParent } from '@/lib/hooks/api/use-pages';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import styles from './page-subpages-list.module.css';

type PageSubpagesListProperties = {
  pageId: string;
};

// Presentational list of a page's direct child pages (THOTH-034), rendered inside the
// "Sub Pages" tab. Fetches lazily via `usePagesByParent`, which is only mounted once that tab
// is active (see the page-detail component), so no request fires until the user opens it.
export function PageSubpagesList({ pageId }: PageSubpagesListProperties) {
  const { data, error, isLoading } = usePagesByParent(pageId);
  const { slug: workspaceSlug } = useCurrentWorkspace();

  if (isLoading) {
    return <Loader />;
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        Failed to load sub pages.
      </Alert>
    );
  }

  const children = data ?? [];

  if (children.length === 0) {
    return <Text c="dimmed">No sub pages yet.</Text>;
  }

  return (
    <Stack gap={0}>
      {children.map(({ page }) => (
        <Link key={page.id} href={`/${workspaceSlug}/pages/${page.id}`} className={styles['row'] ?? ''}>
          <span>{page.emoji ?? '📄'}</span>
          <Text size="sm">{page.name}</Text>
        </Link>
      ))}
    </Stack>
  );
}
