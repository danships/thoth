'use client';

import { Container, Paper, Stack, Text, Title } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { WorkspaceCreateForm } from '@/components/organisms/workspace-create-form';
import type { WorkspaceApi } from '@/types/api';

// Dedicated, bookmarkable full-page creation flow — used for onboarding (a user with no active
// workspace is redirected here from `/`) and as a fallback when the quick-create modal is
// dismissed. Shares the exact same form as the sidebar modal.
export function WorkspaceNewClient() {
  const router = useRouter();

  return (
    <Container size="xs" py="xl">
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <div>
            <Title order={2}>Create a workspace</Title>
            <Text size="sm" c="dimmed">
              Workspaces keep your pages, data sources, and views in separate, isolated spaces.
            </Text>
          </div>
          <WorkspaceCreateForm
            autoFocus
            onCreated={(workspace: WorkspaceApi) => router.push(`/${workspace.slug}/pages`)}
          />
        </Stack>
      </Paper>
    </Container>
  );
}
