'use client';

import { Badge, Button, Group, NumberInput, Paper, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import useSWR from 'swr';
import { ADMIN_WORKSPACES_ENDPOINT, type AdminWorkspaceItem, type GetAdminWorkspacesResponse } from '@/types/api';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { formatBytes } from '@/lib/format/bytes';

export default function AdminWorkspacesPage() {
  const [search, setSearch] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const key = `${ADMIN_WORKSPACES_ENDPOINT}?search=${encodeURIComponent(search)}&includeDeleted=${includeDeleted}`;
  const { data, mutate } = useSWR<GetAdminWorkspacesResponse>(key, () =>
    api.admin
      .listWorkspaces({ ...(search ? { search } : {}), ...(includeDeleted ? { includeDeleted: true } : {}) })
      .then((r) => r.data.data)
  );
  const { showSuccess, showError } = useNotification();

  const handleSave = async (id: string, storageQuotaBytes: number | null) => {
    try {
      await api.admin.updateWorkspace(id, { storageQuotaBytes });
      showSuccess('Workspace quota updated');
      await mutate();
    } catch {
      showError('Failed to update workspace quota');
    }
  };

  return (
    <Stack gap="xl">
      <Title order={2}>Workspaces</Title>

      <Group>
        <TextInput
          placeholder="Search by name, slug, or id"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          maw={360}
        />
        <Switch
          label="Include deleted"
          checked={includeDeleted}
          onChange={(event) => setIncludeDeleted(event.currentTarget.checked)}
        />
      </Group>

      <Paper withBorder p="lg" radius="md">
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Workspace</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Usage</Table.Th>
              <Table.Th>Storage quota</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(data?.items ?? []).map((workspace) => (
              <WorkspaceRow key={workspace.id} workspace={workspace} onSave={handleSave} />
            ))}
          </Table.Tbody>
        </Table>
        {(data?.items ?? []).length === 0 && (
          <Text size="sm" c="dimmed" mt="sm">
            No workspaces found.
          </Text>
        )}
      </Paper>
    </Stack>
  );
}

function WorkspaceRow({
  workspace,
  onSave,
}: {
  workspace: AdminWorkspaceItem;
  onSave: (id: string, storageQuotaBytes: number | null) => Promise<void>;
}) {
  const [hasLimit, setHasLimit] = useState(workspace.storageQuotaBytes !== null);
  const [quotaBytes, setQuotaBytes] = useState<number | ''>(workspace.storageQuotaBytes ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(workspace.id, hasLimit ? (typeof quotaBytes === 'number' ? quotaBytes : 0) : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Table.Tr>
      <Table.Td>
        <Text fw={500}>{workspace.name}</Text>
        <Text size="xs" c="dimmed">
          /{workspace.slug}
        </Text>
      </Table.Td>
      <Table.Td>
        {workspace.deletedAt ? (
          <Badge color="red" variant="light">
            Deleted
          </Badge>
        ) : (
          <Badge color="green" variant="light">
            Active
          </Badge>
        )}
      </Table.Td>
      <Table.Td>{formatBytes(workspace.usedBytes)}</Table.Td>
      <Table.Td>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <Switch
            aria-label="Enforce workspace storage limit"
            checked={hasLimit}
            onChange={(event) => setHasLimit(event.currentTarget.checked)}
          />
          {hasLimit ? (
            <NumberInput
              aria-label="Workspace storage quota in bytes"
              min={0}
              allowDecimal={false}
              allowNegative={false}
              value={quotaBytes}
              onChange={(value) => setQuotaBytes(typeof value === 'number' ? value : '')}
              w={140}
            />
          ) : (
            <Text size="sm" c="dimmed">
              No limit
            </Text>
          )}
          <Button size="xs" onClick={save} loading={saving}>
            Save
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
