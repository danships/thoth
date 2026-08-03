import { describe, expect, test } from 'vitest';
import { getBaseUrl, getData, getOwnerClient, SEED } from '../../support/fixtures';

type PageApi = { id: string };

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('page history API', () => {
  test('records a revision on values save', async () => {
    const client = await getOwner();
    const noteColumn = SEED.dataSource.columns[0];

    const pageResponse = await client.post('/api/v1/pages', {
      name: 'E2E History Values Page',
      emoji: null,
      parentId: SEED.dataSource.id,
      workspaceId: SEED.workspace.id,
    });
    expect(pageResponse.ok).toBe(true);
    const pageEntity = await getData<PageApi>(pageResponse);

    const valuesResponse = await client.patch(`/api/v1/pages/${pageEntity.id}/values`, {
      [noteColumn.id]: { type: 'string', value: 'Done' },
    });
    expect(valuesResponse.ok).toBe(true);

    const historyResponse = await client.get(`/api/v1/pages/${pageEntity.id}/history`, {
      params: { target: 'values' },
    });
    expect(historyResponse.ok).toBe(true);
    const history = await getData<{ revisions: Array<{ target: string; changedColumns?: string[] }> }>(historyResponse);
    expect(history.revisions.length).toBe(1);
    expect(history.revisions[0]?.target).toBe('values');
    expect(history.revisions[0]?.changedColumns).toContain(noteColumn.id);
  });
});
