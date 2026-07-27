'use client';

import { Alert, Button, Center, Stack, Text, Title } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import type { CreateWelcomePageResponse } from '@/types/api';

export function PagesEmptyState() {
  const router = useRouter();
  const { post, inProgress, error } = useCudApi();
  const { showError } = useNotification();
  const [isNavigating, setIsNavigating] = useState(false);
  const workspace = useCurrentWorkspace();

  const handleRecreateWelcomePage = async () => {
    try {
      const page = await post<CreateWelcomePageResponse>('/pages/welcome', { workspaceId: workspace.id });
      setIsNavigating(true);
      router.push(`/${workspace.slug}/pages/${page.id}`);
    } catch {
      showError('Failed to recreate the Welcome page');
    }
  };

  return (
    <Center style={{ minHeight: '60vh' }}>
      <Stack align="center" gap="md">
        <Title order={2}>No pages yet</Title>
        <Text c="dimmed">Your workspace doesn&apos;t have any pages. Get started by recreating the Welcome page.</Text>
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}
        <Button onClick={handleRecreateWelcomePage} loading={inProgress || isNavigating}>
          Recreate Welcome page
        </Button>
      </Stack>
    </Center>
  );
}
