'use client';

import { Anchor, Alert, Badge, Button, Container, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import Link from 'next/link';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useDeletedWorkspaces } from '@/lib/hooks/api/use-deleted-workspaces';
import { useWorkspaces } from '@/lib/hooks/api/use-workspaces';
import { usePlatformCapabilities } from '@/lib/hooks/api/use-platform-capabilities';
import { useNotification } from '@/lib/hooks/use-notification';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import type { WorkspaceApi } from '@/types/api';

export function WorkspacesIndexClient() {
  useDocumentTitle('Workspaces');
  const { data: workspaces } = useWorkspaces();
  const { data: deletedWorkspaces, mutate: mutateDeleted } = useDeletedWorkspaces();
  const { mutate: mutateActive } = useWorkspaces();
  const { data: capabilities } = usePlatformCapabilities();
  const { post, inProgress } = useCudApi();
  const { showSuccess, showError } = useNotification();

  const canCreateWorkspace = capabilities?.canCreateWorkspace ?? true;

  const handleRestore = async (id: string) => {
    try {
      const restored = await post<WorkspaceApi>(`/workspaces/${id}/restore`);
      showSuccess('Workspace restored');
      await Promise.all([mutateDeleted(), mutateActive()]);
      globalThis.location.assign(`/${restored.slug}/pages`);
    } catch {
      showError('Failed to restore workspace');
    }
  };

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="center">
          <Title order={2}>Workspaces</Title>
          {canCreateWorkspace && (
            <Button component={Link} href="/workspaces/new">
              New workspace
            </Button>
          )}
        </Group>

        {!canCreateWorkspace && (
          <Alert color="gray" title="Workspace creation disabled">
            Workspace creation is disabled by your platform administrator.
          </Alert>
        )}

        <Paper withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Title order={4}>Your workspaces</Title>
            <Divider />
            {(workspaces ?? []).length === 0 ? (
              <Text size="sm" c="dimmed">
                You don&apos;t have any active workspaces.
              </Text>
            ) : (
              (workspaces ?? []).map((workspace) => (
                <Group key={workspace.id} justify="space-between" align="center">
                  <Anchor component={Link} href={`/${workspace.slug}/pages`}>
                    {workspace.name}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    /{workspace.slug}
                  </Text>
                </Group>
              ))
            )}
          </Stack>
        </Paper>

        {(deletedWorkspaces ?? []).length > 0 && (
          <Paper withBorder p="lg" radius="md">
            <Stack gap="sm">
              <Title order={4}>Recently deleted</Title>
              <Text size="sm" c="dimmed">
                Deleted workspaces are kept before being permanently removed. Restore one to bring back all its data.
              </Text>
              <Divider />
              {(deletedWorkspaces ?? []).map((workspace) => (
                <Group key={workspace.id} justify="space-between" align="center">
                  <div>
                    <Text fw={500}>{workspace.name}</Text>
                    <Badge color="orange" size="xs">
                      {workspace.daysRemaining} day{workspace.daysRemaining === 1 ? '' : 's'} left
                    </Badge>
                  </div>
                  <Button variant="outline" loading={inProgress} onClick={() => handleRestore(workspace.id)}>
                    Restore
                  </Button>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
