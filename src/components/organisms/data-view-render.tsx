'use client';

import { Alert, Anchor, Loader, Stack, Table, TextInput } from '@mantine/core';
import { usePagesByDataSource } from '@/lib/hooks/api/use-pages';
import { CREATE_PAGE_ENDPOINT, type DataView, type CreatePageBody, type CreatePageResponse } from '@/types/api';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';

type DataViewRenderProperties = {
  view: DataView;
};

export function DataViewRender({ view }: DataViewRenderProperties) {
  const { data: pages, isLoading, error, mutate } = usePagesByDataSource(view.dataSourceId);

  const { post, inProgress } = useCudApi();
  const [newPageName, setNewPageName] = useState('');

  const createPage = useCallback(async () => {
    const name = newPageName.trim();
    if (!name || inProgress) {
      return;
    }
    await post<CreatePageResponse, CreatePageBody>(CREATE_PAGE_ENDPOINT, {
      name,
      emoji: null,
      parentId: view.dataSourceId,
    });
    mutate(); // TODO mutate inline
    setNewPageName('');
  }, [newPageName, inProgress, post, view.dataSourceId, mutate]);

  if (isLoading) {
    return (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error loading pages">
        {error}
      </Alert>
    );
  }

  return (
    <Table striped highlightOnHover w="full" mt="lg">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {pages?.map((page) => (
          <Table.Tr key={page.id}>
            <Table.Td>
              <Anchor component={Link} href={`/pages/${page.id}`}>
                {page.emoji && <span style={{ marginRight: '8px' }}>{page.emoji}</span>}
                {page.name}
              </Anchor>
            </Table.Td>
          </Table.Tr>
        ))}
        <Table.Tr>
          <Table.Td>
            <TextInput
              placeholder="New page name"
              value={newPageName}
              onChange={(event) => setNewPageName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void createPage();
                }
              }}
              disabled={inProgress}
            />
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}
