'use client';

import { ActionIcon, Badge, Button, Group, Table, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArchive, IconEdit, IconKey } from '@tabler/icons-react';
import { getAppScopeLabel } from '@/lib/format/app-scope-label';
import type { AppResponse } from '@/types/api';

type AppsTableProperties = {
  apps: AppResponse[];
  onManage: (app: AppResponse) => void;
  onEdit: (app: AppResponse) => void;
  onArchive: (app: AppResponse) => void;
};

export function AppsTable({ apps, onManage, onEdit, onArchive }: AppsTableProperties) {
  const confirmArchive = (app: AppResponse) => {
    modals.openConfirmModal({
      title: 'Archive App',
      children: (
        <Text size="sm">
          This revokes all of &quot;{app.label}&quot;&apos;s keys immediately. This can&apos;t be undone.
        </Text>
      ),
      labels: { confirm: 'Archive', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => onArchive(app),
    });
  };

  if (apps.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No Apps yet. Create one to start using API keys for programmatic requests.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={600} type="native">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Label</Table.Th>
            <Table.Th>Permission</Table.Th>
            <Table.Th>Scope</Table.Th>
            <Table.Th>Keys</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {apps.map((app) => (
            <Table.Tr key={app.id}>
              <Table.Td>{app.label}</Table.Td>
              <Table.Td>
                <Badge color={app.permission === 'read_write' ? 'blue' : 'gray'} variant="light">
                  {app.permission}
                </Badge>
              </Table.Td>
              <Table.Td>{getAppScopeLabel(app.scopeType)}</Table.Td>
              <Table.Td>{app.keyCount}</Table.Td>
              <Table.Td>
                {app.archivedAt ? (
                  <Badge color="red">Archived</Badge>
                ) : (
                  <Badge color="teal" variant="light">
                    Active
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <Button size="xs" variant="light" leftSection={<IconKey size={14} />} onClick={() => onManage(app)}>
                    Manage keys
                  </Button>
                  {!app.archivedAt && (
                    <>
                      <Tooltip label="Edit App">
                        <ActionIcon variant="subtle" aria-label="Edit App" onClick={() => onEdit(app)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Archive App">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          aria-label="Archive App"
                          onClick={() => confirmArchive(app)}
                        >
                          <IconArchive size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
