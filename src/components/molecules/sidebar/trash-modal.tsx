'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Group, Loader, Modal, Stack, Table, Text } from '@mantine/core';
import { api } from '@/lib/api/client';
import { useDeletedPages } from '@/lib/hooks/api/use-deleted-pages';
import { useNotification } from '@/lib/hooks/use-notification';
import { useCurrentWorkspace } from '@/lib/store/workspace-context';
import { revalidateWorkspacePageData } from '@/lib/swr/revalidate-workspace-page-data';

type TrashModalProperties = {
  opened: boolean;
  onClose: () => void;
};

export function TrashModal({ opened, onClose }: TrashModalProperties) {
  const { id: workspaceId } = useCurrentWorkspace();
  const { data, isLoading, error, mutate } = useDeletedPages();
  const { showError, showSuccess } = useNotification();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inProgress, setInProgress] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleId = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleRestore = async (ids: string[]) => {
    setInProgress(true);
    try {
      const response = await api.pages.restoreMany(ids);
      const result = response.data.data;
      if (result.failed.length > 0) {
        showError(result.failed[0]?.reason ?? 'Failed to restore item');
      }
      if (result.restored.length > 0) {
        showSuccess(`Restored ${result.restored.length} item${result.restored.length === 1 ? '' : 's'}`);
        setSelectedIds((current) => current.filter((id) => !result.restored.includes(id)));
        await Promise.all([mutate(), revalidateWorkspacePageData(workspaceId)]);
      }
    } catch {
      showError('Failed to restore deleted items');
    } finally {
      setInProgress(false);
    }
  };

  const handlePermanentDelete = async (ids: string[]) => {
    setInProgress(true);
    try {
      const response = await api.pages.removeManyPermanently(ids);
      const result = response.data.data;
      if (result.failed.length > 0) {
        showError(result.failed[0]?.reason ?? 'Failed to permanently delete item');
      }
      if (result.deleted.length > 0) {
        showSuccess(`Permanently deleted ${result.deleted.length} item${result.deleted.length === 1 ? '' : 's'}`);
        setSelectedIds((current) => current.filter((id) => !result.deleted.includes(id)));
        await Promise.all([mutate(), revalidateWorkspacePageData(workspaceId)]);
      }
    } catch {
      showError('Failed to permanently delete deleted items');
    } finally {
      setInProgress(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Trash" centered size="xl">
      {isLoading && (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      )}

      {!isLoading && error && (
        <Stack gap="sm">
          <Text c="red" size="sm">
            Failed to load deleted items.
          </Text>
          <Button variant="default" onClick={() => mutate()}>
            Retry
          </Button>
        </Stack>
      )}

      {!isLoading && !error && (
        <Stack gap="md">
          {!data || data.length === 0 ? (
            <Text size="sm" c="dimmed">
              Trash is empty.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={44}>
                      <Checkbox
                        aria-label="Select all deleted items"
                        checked={data.length > 0 && selectedIds.length === data.length}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < data.length}
                        onChange={(event) =>
                          setSelectedIds(event.currentTarget.checked ? data.map((item) => item.id) : [])
                        }
                      />
                    </Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Time left</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Checkbox
                          aria-label={`Select ${item.name}`}
                          checked={selectedSet.has(item.id)}
                          onChange={() => toggleId(item.id)}
                        />
                      </Table.Td>
                      <Table.Td>{item.name}</Table.Td>
                      <Table.Td>
                        <Badge variant="light">{item.type}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {item.daysRemaining} day{item.daysRemaining === 1 ? '' : 's'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            disabled={inProgress}
                            onClick={() => void handleRestore([item.id])}
                          >
                            Restore
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="outline"
                            disabled={inProgress}
                            onClick={() => void handlePermanentDelete([item.id])}
                          >
                            Delete permanently
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {selectedIds.length} selected
            </Text>
            <Group gap="xs">
              <Button
                variant="default"
                disabled={selectedIds.length === 0 || inProgress}
                onClick={() => void handleRestore(selectedIds)}
              >
                Restore selected
              </Button>
              <Button
                color="red"
                disabled={selectedIds.length === 0 || inProgress}
                onClick={() => void handlePermanentDelete(selectedIds)}
              >
                Delete selected permanently
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
