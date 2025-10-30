'use client';

import { Alert, Anchor, Checkbox, Loader, Stack, Table, TextInput } from '@mantine/core';
import { usePagesByDataSource } from '@/lib/hooks/api/use-pages';
import {
  CREATE_PAGE_ENDPOINT,
  UPDATE_PAGE_VALUES_ENDPOINT,
  type DataView,
  type CreatePageBody,
  type CreatePageResponse,
} from '@/types/api';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useCudApi } from '@/lib/hooks/use-cud-api';
import { useDataSource } from '@/lib/hooks/api/use-data-source';

type DataViewRenderProperties = {
  view: DataView;
};

export function DataViewRender({ view }: DataViewRenderProperties) {
  const { data: pages, isLoading, error, mutate } = usePagesByDataSource(view.dataSourceId, { includeValues: true });
  const { data: dataSource, isLoading: isDataSourceLoading } = useDataSource(view.dataSourceId);

  const { post, patch, inProgress } = useCudApi();
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

  const handleBooleanChange = useCallback(
    (pageId: string, colId: string) => async (event: React.ChangeEvent<HTMLInputElement>) => {
      const v = { type: 'boolean' as const, value: event.currentTarget.checked };
      await patch(UPDATE_PAGE_VALUES_ENDPOINT.replace(':id', pageId), { [colId]: v });
      mutate(
        (previous) =>
          previous?.map((pageItem) =>
            pageItem.page.id === pageId ? { ...pageItem, values: { ...pageItem.values, [colId]: v } } : pageItem
          ),
        { revalidate: false }
      );
    },
    [patch, mutate]
  );

  const handleCellBlur = useCallback(
    (pageId: string, colId: string, colType: 'string' | 'number') =>
      async (event: React.FocusEvent<HTMLDivElement>) => {
        const text = event.currentTarget.textContent ?? '';
        const v =
          colType === 'number'
            ? { type: 'number' as const, value: Number(text) }
            : { type: 'string' as const, value: text };
        if (colType === 'number' && Number.isNaN(v.value)) {
          return;
        }
        await patch(UPDATE_PAGE_VALUES_ENDPOINT.replace(':id', pageId), { [colId]: v });
        mutate(
          (previous) =>
            previous?.map((pageItem) =>
              pageItem.page.id === pageId ? { ...pageItem, values: { ...pageItem.values, [colId]: v } } : pageItem
            ),
          { revalidate: false }
        );
      },
    [patch, mutate]
  );

  const handleNewPageNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setNewPageName(event.currentTarget.value);
  }, []);

  const handleNewPageKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        void createPage();
      }
    },
    [createPage]
  );

  if (isLoading || isDataSourceLoading) {
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
          {dataSource?.columns?.map((col) => (
            <Table.Th key={col.id}>{col.name}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {pages?.map(({ page, values }) => (
          <Table.Tr key={page.id}>
            <Table.Td>
              <Anchor component={Link} href={`/pages/${page.id}`}>
                {page.emoji && <span style={{ marginRight: '8px' }}>{page.emoji}</span>}
                {page.name}
              </Anchor>
            </Table.Td>
            {dataSource?.columns?.map((col) => {
              const current = values?.[col.id];
              if (col.type === 'boolean') {
                return (
                  <Table.Td key={col.id}>
                    <Checkbox
                      checked={current?.type === 'boolean' ? current.value : false}
                      onChange={handleBooleanChange(page.id, col.id)}
                      disabled={inProgress}
                    />
                  </Table.Td>
                );
              }

              return (
                <Table.Td key={col.id}>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={handleCellBlur(page.id, col.id, col.type)}
                    style={{ minWidth: 120, outline: 'none', cursor: 'text' }}
                  >
                    {current?.value == null ? '' : String(current.value)}
                  </div>
                </Table.Td>
              );
            })}
          </Table.Tr>
        ))}
        <Table.Tr>
          <Table.Td>
            <TextInput
              placeholder="New page name"
              value={newPageName}
              onChange={handleNewPageNameChange}
              onKeyDown={handleNewPageKeyDown}
              disabled={inProgress}
            />
          </Table.Td>
          {dataSource?.columns?.map((c) => (
            <Table.Td key={c.id} />
          ))}
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}
