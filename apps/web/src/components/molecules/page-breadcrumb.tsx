'use client';

import { Breadcrumbs, Anchor, Text, Group, Menu, ActionIcon } from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';
import Link from 'next/link';
import type { Page } from '@/types/api';
import { usePageUrl } from '@/lib/hooks/use-page-url';
import styles from './page-breadcrumb.module.css';

type PageBreadcrumbProperties = {
  pages: Page[];
};

function renderPageLabel(page: Page) {
  return (
    <Group gap="xs" wrap="nowrap" component="span">
      {page.emoji && <span>{page.emoji}</span>}
      <span className={styles['truncatedLabel']}>{page.name}</span>
    </Group>
  );
}

function renderCrumb(page: Page, isLast: boolean, getPageUrl: (page: { id: string; name?: string | null }) => string) {
  if (isLast) {
    return (
      <Text key={page.id} size="xs" fw={500} component="span">
        {renderPageLabel(page)}
      </Text>
    );
  }

  return (
    <Anchor key={page.id} component={Link} href={getPageUrl(page)} size="xs">
      {renderPageLabel(page)}
    </Anchor>
  );
}

export function PageBreadcrumb({ pages }: PageBreadcrumbProperties) {
  // Hooks must run unconditionally on every render, so the "single-entry trail" bail-out
  // (see below) happens after they're declared, not before.
  const [containerReference, containerRect] = useResizeObserver<HTMLDivElement>();
  const [measureReference, measureRect] = useResizeObserver<HTMLDivElement>();
  const getPageUrl = usePageUrl();

  // A single-entry trail means we're on the root page — nothing to navigate up to.
  if (pages.length <= 1) {
    return null;
  }

  const firstPage = pages[0]!;
  const lastPage = pages.at(-1)!;
  const middlePages = pages.slice(1, -1);

  // Collapse only once there's at least one middle page to hide, and the full (unconstrained)
  // trail measured via the hidden clone no longer fits within the available container width.
  const isCollapsed = middlePages.length > 0 && containerRect.width > 0 && measureRect.width > containerRect.width;

  return (
    <div ref={containerReference} className={styles['breadcrumbContainer']}>
      {/* Hidden clone used purely to measure the natural (unconstrained) width of the full trail. */}
      <div ref={measureReference} className={styles['measure']} aria-hidden="true">
        <Breadcrumbs separator=">">
          {pages.map((page, index) => renderCrumb(page, index === pages.length - 1, getPageUrl))}
        </Breadcrumbs>
      </div>

      <Breadcrumbs separator=">" aria-label="Breadcrumb">
        {isCollapsed
          ? [
              renderCrumb(firstPage, false, getPageUrl),
              <Menu key="ellipsis-menu" shadow="md" position="bottom-start">
                <Menu.Target>
                  <ActionIcon variant="subtle" size="sm" aria-label="Show hidden breadcrumb pages">
                    …
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {middlePages.map((page) => (
                    <Menu.Item key={page.id} component={Link} href={getPageUrl(page)}>
                      {page.name}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>,
              renderCrumb(lastPage, true, getPageUrl),
            ]
          : pages.map((page, index) => renderCrumb(page, index === pages.length - 1, getPageUrl))}
      </Breadcrumbs>
    </div>
  );
}
