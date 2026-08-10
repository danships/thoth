'use client';

import { AppShell, Loader } from '@mantine/core';
import { type PropsWithChildren, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/provider';
import { AppHeader } from '@/components/molecules/app-header';

/**
 * A minimal `AppShell` — header only, no navbar/sidebar — for routes that aren't scoped to a
 * `[workspaceSlug]` segment (currently just `/workspaces` and `/workspaces/new`), so they still
 * render with the same header chrome as the rest of the app instead of a bare, unstyled page.
 * Mirrors the auth-redirect-if-not-logged-in behavior of `src/components/layout.tsx`.
 */
export default function GlobalLayout({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return <Loader />;
  }

  if (!user) {
    return undefined; // Will redirect to login
  }

  return (
    <AppShell padding={{ base: 'xs', sm: 'md' }} header={{ height: 30 }}>
      <AppShell.Header>
        <AppHeader />
      </AppShell.Header>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
