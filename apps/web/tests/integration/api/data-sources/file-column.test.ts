import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient, getSecondUserClient, SEED } from '../../support/fixtures';

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function createDataSource(client: ApiClient, workspaceId: string, name: string) {
  const response = await client.post('/api/v1/data-sources', {
    workspaceId,
    name,
    columns: [{ name: 'Title', type: 'string' }],
  });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function createPage(client: ApiClient, data: { name: string; workspaceId: string; parentId: string }) {
  const response = await client.post('/api/v1/pages', { emoji: null, ...data });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function addFileColumn(client: ApiClient, dataSourceId: string, name: string) {
  const response = await client.post(`/api/v1/data-sources/${dataSourceId}/columns`, { name, type: 'file' });
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function uploadFile(client: ApiClient, pageId: string, filename: string, contents: string) {
  const form = new FormData();
  const blob = new globalThis.Blob([contents], { type: 'text/plain' });
  form.set('file', blob, filename);
  form.set('pageId', pageId);
  const response = await client.fetch('/api/v1/files', { method: 'POST', body: form });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

describe('file column API (THOTH-054)', () => {
  test('a file value can be attached, read back, and cleared via PATCH /pages/:id/values', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const dataSource = await createDataSource(client, SEED.workspace.id, `THOTH-054 Data Source ${unique}`);
    const fileColumn = await addFileColumn(client, dataSource.id, 'Attachment');
    const page = await createPage(client, {
      name: `THOTH-054 Row ${unique}`,
      workspaceId: SEED.workspace.id,
      parentId: dataSource.id,
    });

    const fileId = await uploadFile(client, page.id, `attachment-${unique}.txt`, 'hello attachment');

    const attachResponse = await client.patch(`/api/v1/pages/${page.id}/values`, {
      [fileColumn.id]: { type: 'file', value: fileId },
    });
    expect(attachResponse.ok).toBe(true);

    const detailsResponse = await client.get(`/api/v1/pages/${page.id}`, {
      params: { includeValues: 'true' },
    });
    const details = await getData<{ values?: Record<string, { type: string; value: string | null }> }>(
      detailsResponse
    );
    expect(details.values?.[fileColumn.id]).toEqual({ type: 'file', value: fileId });

    const clearResponse = await client.patch(`/api/v1/pages/${page.id}/values`, {
      [fileColumn.id]: { type: 'file', value: null },
    });
    expect(clearResponse.ok).toBe(true);

    const detailsAfterClear = await client.get(`/api/v1/pages/${page.id}`, { params: { includeValues: 'true' } });
    const afterClear = await getData<{ values?: Record<string, { type: string; value: string | null }> }>(
      detailsAfterClear
    );
    expect(afterClear.values?.[fileColumn.id]?.value).toBeNull();
  });

  test('rejects a value referencing a nonexistent file id with 400', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const dataSource = await createDataSource(client, SEED.workspace.id, `THOTH-054 Unknown File DS ${unique}`);
    const fileColumn = await addFileColumn(client, dataSource.id, 'Attachment');
    const page = await createPage(client, {
      name: `THOTH-054 Unknown File Row ${unique}`,
      workspaceId: SEED.workspace.id,
      parentId: dataSource.id,
    });

    const response = await client.patch(`/api/v1/pages/${page.id}/values`, {
      [fileColumn.id]: { type: 'file', value: 'does-not-exist-file-id' },
    });
    expect(response.status).toBe(400);
  });

  test('rejects a value referencing a file the caller cannot reach with 400', async () => {
    const owner = await getOwner();
    const secondUser = await getSecondUserClient(getBaseUrl());
    const unique = Date.now();

    const dataSource = await createDataSource(owner, SEED.workspace.id, `THOTH-054 Inaccessible File DS ${unique}`);
    const fileColumn = await addFileColumn(owner, dataSource.id, 'Attachment');
    const page = await createPage(owner, {
      name: `THOTH-054 Inaccessible File Row ${unique}`,
      workspaceId: SEED.workspace.id,
      parentId: dataSource.id,
    });

    // Uploaded by `secondUser` with no `pageId` — an orphan with zero `file-usage` rows, so
    // `assertFileAccess` denies everyone but the uploader themself.
    const form = new FormData();
    const blob = new globalThis.Blob(['orphan content'], { type: 'text/plain' });
    form.set('file', blob, `orphan-${unique}.txt`);
    const uploadResponse = await secondUser.fetch('/api/v1/files', { method: 'POST', body: form });
    expect(uploadResponse.ok).toBe(true);
    const orphanFile = (await uploadResponse.json()) as { data: { id: string } };

    const response = await owner.patch(`/api/v1/pages/${page.id}/values`, {
      [fileColumn.id]: { type: 'file', value: orphanFile.data.id },
    });
    expect(response.status).toBe(400);
  });

  test('deleting a file column reconciles file-usage so it no longer grants access via that page', async () => {
    const owner = await getOwner();
    const secondUser = await getSecondUserClient(getBaseUrl());
    const unique = Date.now();

    const dataSource = await createDataSource(owner, SEED.workspace.id, `THOTH-054 Cascade DS ${unique}`);
    const fileColumn = await addFileColumn(owner, dataSource.id, 'Attachment');
    const page = await createPage(owner, {
      name: `THOTH-054 Cascade Row ${unique}`,
      workspaceId: SEED.workspace.id,
      parentId: dataSource.id,
    });

    const fileId = await uploadFile(owner, page.id, `cascade-${unique}.txt`, 'cascade content');
    const attachResponse = await owner.patch(`/api/v1/pages/${page.id}/values`, {
      [fileColumn.id]: { type: 'file', value: fileId },
    });
    expect(attachResponse.ok).toBe(true);

    // `secondUser` is a fellow member of `SEED.workspace` (not the uploader) — access is only
    // possible because the value-save reconciled a `file-usage` row linking the file to `page`.
    const beforeDelete = await secondUser.get(`/api/v1/files/${fileId}/content`);
    expect(beforeDelete.ok).toBe(true);

    const deleteColumnResponse = await owner.delete(`/api/v1/data-sources/${dataSource.id}/columns/${fileColumn.id}`);
    expect(deleteColumnResponse.status).toBe(204);

    const afterDelete = await secondUser.get(`/api/v1/files/${fileId}/content`);
    expect(afterDelete.status).toBe(403);

    // The uploader can still reach their own file directly regardless of `file-usage`.
    const ownerStillHasAccess = await owner.get(`/api/v1/files/${fileId}/content`);
    expect(ownerStillHasAccess.ok).toBe(true);
  });
});
