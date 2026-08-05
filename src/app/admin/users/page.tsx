'use client';

import { Badge, Button, Group, NumberInput, Paper, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import useSWR from 'swr';
import { ADMIN_USERS_ENDPOINT, type AdminUserItem, type GetAdminUsersResponse } from '@/types/api';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { formatBytes } from '@/lib/format/bytes';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const key = `${ADMIN_USERS_ENDPOINT}?search=${encodeURIComponent(search)}`;
  const { data, mutate } = useSWR<GetAdminUsersResponse>(key, () =>
    api.admin.listUsers(search ? { search } : undefined).then((r) => r.data.data)
  );
  const { showSuccess, showError } = useNotification();

  const handleSave = async (id: string, storageQuotaBytes: number | null) => {
    try {
      await api.admin.updateUser(id, { storageQuotaBytes });
      showSuccess('User quota updated');
      await mutate();
    } catch {
      showError('Failed to update user quota');
    }
  };

  return (
    <Stack gap="xl">
      <Title order={2}>Users</Title>

      <TextInput
        placeholder="Search by name, email, or id"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        maw={360}
      />

      <Paper withBorder p="lg" radius="md">
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Usage</Table.Th>
                <Table.Th>Storage quota</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((user) => (
                <UserRow key={user.id} user={user} onSave={handleSave} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {(data?.items ?? []).length === 0 && (
          <Text size="sm" c="dimmed" mt="sm">
            No users found.
          </Text>
        )}
      </Paper>
    </Stack>
  );
}

function UserRow({
  user,
  onSave,
}: {
  user: AdminUserItem;
  onSave: (id: string, storageQuotaBytes: number | null) => Promise<void>;
}) {
  const [hasLimit, setHasLimit] = useState(user.storageQuotaBytes !== null);
  const [quotaBytes, setQuotaBytes] = useState<number | ''>(user.storageQuotaBytes ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(user.id, hasLimit ? (typeof quotaBytes === 'number' ? quotaBytes : 0) : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Table.Tr>
      <Table.Td>
        <Text fw={500}>{user.name || user.email}</Text>
        <Text size="xs" c="dimmed">
          {user.email}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge color={user.role === 'platform_admin' ? 'grape' : 'gray'} variant="light">
          {user.role}
        </Badge>
      </Table.Td>
      <Table.Td>{formatBytes(user.usedBytes)}</Table.Td>
      <Table.Td>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <Switch
            aria-label="Enforce user storage limit"
            checked={hasLimit}
            onChange={(event) => setHasLimit(event.currentTarget.checked)}
          />
          {hasLimit ? (
            <NumberInput
              aria-label="User storage quota in bytes"
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
