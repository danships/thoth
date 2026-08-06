'use client';

import { Alert, Button, Group, NumberInput, Paper, Stack, Switch, Text, Title } from '@mantine/core';
import { useState } from 'react';
import useSWR from 'swr';
import { ADMIN_SETTINGS_ENDPOINT, type AdminSettingsResponse } from '@/types/api';
import { swrFetcher } from '@/lib/swr/fetcher';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { formatBytes } from '@/lib/format/bytes';

export default function AdminOverviewPage() {
  const { data, mutate } = useSWR<AdminSettingsResponse>(ADMIN_SETTINGS_ENDPOINT, swrFetcher);

  return (
    <Stack gap="xl" maw={560}>
      <Title order={2}>Platform overview</Title>
      {data ? (
        // Remount the form whenever the server state changes so it re-seeds its local inputs from
        // fresh data without a setState-in-effect (which the lint rules disallow).
        <SettingsForm
          key={`${data.allowUserWorkspaceCreation}:${data.storageQuotaBytes}`}
          settings={data}
          onSaved={mutate}
        />
      ) : (
        <Text size="sm" c="dimmed">
          Loading platform settings…
        </Text>
      )}
    </Stack>
  );
}

function SettingsForm({
  settings,
  onSaved,
}: {
  settings: AdminSettingsResponse;
  onSaved: (next?: AdminSettingsResponse, options?: { revalidate: boolean }) => Promise<unknown>;
}) {
  const { showSuccess, showError } = useNotification();
  const [allowCreation, setAllowCreation] = useState(settings.allowUserWorkspaceCreation);
  const [hasLimit, setHasLimit] = useState(settings.storageQuotaBytes !== null);
  const [quotaBytes, setQuotaBytes] = useState<number | ''>(settings.storageQuotaBytes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextQuota = hasLimit ? (typeof quotaBytes === 'number' ? quotaBytes : 0) : null;
      const response = await api.admin.updateSettings({
        allowUserWorkspaceCreation: allowCreation,
        storageQuotaBytes: nextQuota,
      });
      await onSaved(response.data.data, { revalidate: false });
      showSuccess('Platform settings updated');
    } catch {
      showError('Failed to update platform settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Title order={4}>Workspace creation</Title>
        <Switch
          label="Allow users to create their own workspaces"
          description="When disabled, only platform administrators can create additional workspaces."
          checked={allowCreation}
          onChange={(event) => setAllowCreation(event.currentTarget.checked)}
        />

        <Title order={4} mt="md">
          Platform storage limit
        </Title>
        <Switch
          label="Enforce a platform-wide storage limit"
          checked={hasLimit}
          onChange={(event) => setHasLimit(event.currentTarget.checked)}
        />
        {hasLimit ? (
          <NumberInput
            label="Platform storage quota (bytes)"
            aria-label="Platform storage quota in bytes"
            min={0}
            allowDecimal={false}
            allowNegative={false}
            value={quotaBytes}
            onChange={(value) => setQuotaBytes(typeof value === 'number' ? value : '')}
          />
        ) : (
          <Text size="sm" c="dimmed">
            No platform limit
          </Text>
        )}

        <Alert color="blue" variant="light">
          Platform-wide usage: {formatBytes(settings.usedBytes)}
        </Alert>

        <Group justify="flex-end">
          <Button onClick={handleSave} loading={saving}>
            Save settings
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
