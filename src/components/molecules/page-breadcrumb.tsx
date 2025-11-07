'use client';

import { Breadcrumbs, Anchor, Text } from '@mantine/core';
import Link from 'next/link';
import type { Page } from '@/types/api';

type PageBreadcrumbProperties = {
  pages: Page[];
};

export function PageBreadcrumb({ pages }: PageBreadcrumbProperties) {
  if (pages.length === 0) {
    return null;
  }
  return (
    <Breadcrumbs separator=">">
      {pages.map((page, index) => {
        const isLast = index === pages.length - 1;
        const content = (
          <>
            {page.emoji && <span>{page.emoji}</span>}
            <span>{page.name}</span>
          </>
        );

        if (isLast) {
          return (
            <Text key={page.id} size="sm" fw={500}>
              {content}
            </Text>
          );
        }

        return (
          <Anchor key={page.id} component={Link} href={`/pages/${page.id}`} size="sm">
            {content}
          </Anchor>
        );
      })}
    </Breadcrumbs>
  );
}
