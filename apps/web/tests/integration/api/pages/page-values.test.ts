import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

type Column = { id: string; type: string; options?: Array<{ id: string }> };

async function createFixture(client: ApiClient) {
  const unique = Date.now();
  const dataSourceResponse = await client.post('/api/v1/data-sources', {
    workspaceId: SEED.workspace.id,
    name: `THOTH-090 ${unique}`,
    columns: [{ name: 'Text', type: 'string' }],
  });
  expect(dataSourceResponse.ok).toBe(true);
  const dataSource = await getData<{ id: string; columns: Column[] }>(dataSourceResponse);
  const columns = [...dataSource.columns];
  for (const body of [
    { name: 'Number', type: 'number' },
    { name: 'Boolean', type: 'boolean' },
    { name: 'Date', type: 'date', mode: 'datetime', displayFormat: 'ISO' },
    { name: 'Status', type: 'single-select', options: [{ label: 'Open', color: 'blue' }] },
    { name: 'Tags', type: 'multi-select', options: [{ label: 'Urgent', color: 'red' }] },
  ]) {
    const response = await client.post(`/api/v1/data-sources/${dataSource.id}/columns`, body);
    expect(response.ok).toBe(true);
    columns.push(await getData<Column>(response));
  }
  const pageResponse = await client.post('/api/v1/pages', {
    name: `THOTH-090 row ${unique}`,
    emoji: null,
    workspaceId: SEED.workspace.id,
    parentId: dataSource.id,
  });
  expect(pageResponse.ok).toBe(true);
  return { page: await getData<{ id: string }>(pageResponse), columns };
}

describe('page values API shorthand payload (THOTH-090)', () => {
  test('stores mixed shorthand and legacy input as canonical PageValues', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const { page, columns } = await createFixture(client);
    const byType = Object.fromEntries(columns.map((column) => [column.type, column]));
    const status = byType['single-select']!;
    const tags = byType['multi-select']!;

    const response = await client.patch(`/api/v1/pages/${page.id}/values`, {
      [byType['string']!.id]: 'Quarterly review',
      [byType['number']!.id]: 9.5,
      [byType['boolean']!.id]: { type: 'boolean', value: true },
      [byType['date']!.id]: '2026-08-24T10:30:00.000Z',
      [status.id]: status.options![0]!.id,
      [tags.id]: [tags.options![0]!.id],
    });
    expect(response.status).toBe(204);

    const detailResponse = await client.get(`/api/v1/pages/${page.id}`, { params: { includeValues: 'true' } });
    const detail = await getData<{ values: Record<string, unknown> }>(detailResponse);
    expect(detail.values).toMatchObject({
      [byType['string']!.id]: { type: 'string', value: 'Quarterly review' },
      [byType['number']!.id]: { type: 'number', value: 9.5 },
      [byType['boolean']!.id]: { type: 'boolean', value: true },
      [byType['date']!.id]: { type: 'date', value: '2026-08-24T10:30:00.000Z' },
      [status.id]: { type: 'single-select', value: status.options![0]!.id },
      [tags.id]: { type: 'multi-select', value: [tags.options![0]!.id] },
    });
  });

  test('rejects invalid shorthand shapes without changing values', async () => {
    const client = await getOwnerClient(getBaseUrl());
    const { page, columns } = await createFixture(client);
    const byType = Object.fromEntries(columns.map((column) => [column.type, column]));
    for (const body of [
      { [byType['number']!.id]: '9.5' },
      { [byType['boolean']!.id]: 'true' },
      { [byType['date']!.id]: 'not-a-date' },
      { [byType['string']!.id]: ['not text'] },
      { [byType['multi-select']!.id]: 'not-an-array' },
      { unknownColumn: 'value' },
      { [byType['single-select']!.id]: 'unknown-option' },
    ]) {
      const response = await client.patch(`/api/v1/pages/${page.id}/values`, body);
      expect(response.status).toBe(400);
    }
  });
});
