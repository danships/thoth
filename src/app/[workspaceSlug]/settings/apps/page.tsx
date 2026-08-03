'use client';

import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { AppFormModal } from '@/components/organisms/app-form-modal';
import { AppsTable } from '@/components/organisms/apps-table';
import { useApps } from '@/lib/hooks/api/use-apps';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import type { AppResponse } from '@/types/api';

export default function AppsSettingsPage() {
  const workspace = useCurrentWorkspace();
  useDocumentTitle('Apps');
  const { data, isLoading, mutate } = useApps(workspace.id);
  const { delete: remove } = useCudApi();
  const { showSuccess, showError } = useNotification();

  const [formApp, setFormApp] = useState<AppResponse | 'new' | undefined>(undefined);

  const handleSaved = () => {
    setFormApp(undefined);
    void mutate();
  };

  const handleArchive = async (app: AppResponse) => {
    try {
      await remove(`/apps/${app.id}`);
      showSuccess('App archived');
      void mutate();
    } catch {
      showError('Failed to archive App');
    }
  };

  return (
    <Stack gap="xl" maw={900}>
      <Group justify="space-between">
        <div>
          <Title order={2}>Apps</Title>
          <Text size="sm" c="dimmed">
            Manage programmatic API keys for this workspace.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setFormApp('new')}>
          New App
        </Button>
      </Group>

      {!isLoading && <AppsTable apps={data?.apps ?? []} onEdit={(app) => setFormApp(app)} onArchive={handleArchive} />}

      <AppFormModal
        opened={Boolean(formApp)}
        workspaceId={workspace.id}
        app={formApp === 'new' ? undefined : formApp}
        onClose={() => setFormApp(undefined)}
        onSaved={handleSaved}
      />
    </Stack>
  );
}
