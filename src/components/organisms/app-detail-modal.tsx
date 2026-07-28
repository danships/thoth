'use client';

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useApp } from '@/lib/hooks/api/use-app';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useNotification } from '@/lib/hooks/use-notification';
import { ApiKeyCreatedModal } from './api-key-created-modal';
import type { CreateApiKeyBody, CreateApiKeyResponse } from '@/types/api';

type AppDetailModalProperties = {
  appId: string | undefined;
  onClose: () => void;
};

// The "manage keys" surface for a single App — shows its resolved scope, the owner label
// (`createdByDisplayName`, resolved via `resolveOwnerDisplay` on the server), and a table of
// keys with mint/revoke actions. Rotation is just "mint a new one, then revoke the old one".
export function AppDetailModal({ appId, onClose }: AppDetailModalProperties) {
  const { data: app, isLoading, mutate } = useApp(appId);
  const { post, delete: remove } = useCudApi();
  const { showError, showSuccess } = useNotification();
  const [createdSecret, setCreatedSecret] = useState<string | undefined>(undefined);

  const form = useForm({
    initialValues: { label: '', expiresAt: '' },
  });

  const handleMintKey = async (values: typeof form.values) => {
    if (!appId) {
      return;
    }
    try {
      const body: CreateApiKeyBody = {
        ...(values.label.trim() && { label: values.label.trim() }),
        ...(values.expiresAt && { expiresAt: new Date(values.expiresAt).toISOString() }),
      };
      const created = await post<CreateApiKeyResponse, CreateApiKeyBody>(`/apps/${appId}/keys`, body);
      setCreatedSecret(created.secret);
      form.reset();
      await mutate();
    } catch {
      showError('Failed to create API key');
    }
  };

  const handleRevoke = (keyId: string) => {
    if (!appId) {
      return;
    }
    modals.openConfirmModal({
      title: 'Revoke key',
      children: <Text size="sm">This key will stop working immediately. This can&apos;t be undone.</Text>,
      labels: { confirm: 'Revoke', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove(`/apps/${appId}/keys/${keyId}`);
          showSuccess('Key revoked');
          await mutate();
        } catch {
          showError('Failed to revoke key');
        }
      },
    });
  };

  return (
    <>
      <Modal
        opened={Boolean(appId)}
        onClose={onClose}
        title={app ? app.label : 'App'}
        size="lg"
        centered
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        {isLoading && <Loader />}
        {app && (
          <Stack gap="lg">
            <Group gap="xs">
              <Badge color={app.permission === 'read_write' ? 'blue' : 'gray'}>{app.permission}</Badge>
              <Badge variant="light">{app.scopeType}</Badge>
              <Badge variant="light">Created by {app.createdByDisplayName}</Badge>
              {app.archivedAt && <Badge color="red">Archived</Badge>}
            </Group>

            <div>
              <Title order={5} mb="xs">
                Keys
              </Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Label</Table.Th>
                    <Table.Th>Prefix</Table.Th>
                    <Table.Th>Last used</Table.Th>
                    <Table.Th>Expires</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {app.keys.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">
                          No keys yet.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {app.keys.map((key) => (
                    <Table.Tr key={key.id}>
                      <Table.Td>{key.label}</Table.Td>
                      <Table.Td>
                        <code>{key.keyPrefix}…</code>
                      </Table.Td>
                      <Table.Td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</Table.Td>
                      <Table.Td>{key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}</Table.Td>
                      <Table.Td>
                        {key.revokedAt ? (
                          <Badge color="red" variant="light">
                            Revoked
                          </Badge>
                        ) : (
                          <Badge color="teal" variant="light">
                            Active
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {!key.revokedAt && !app.archivedAt && (
                          <Tooltip label="Revoke key">
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              aria-label="Revoke key"
                              onClick={() => handleRevoke(key.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>

            {!app.archivedAt && (
              <form onSubmit={form.onSubmit(handleMintKey)}>
                <Group align="flex-end" gap="sm">
                  <TextInput label="New key label" placeholder="prod" {...form.getInputProps('label')} />
                  <Button type="submit">Create key</Button>
                </Group>
              </form>
            )}
          </Stack>
        )}
      </Modal>

      <ApiKeyCreatedModal
        opened={Boolean(createdSecret)}
        secret={createdSecret}
        onClose={() => setCreatedSecret(undefined)}
      />
    </>
  );
}
