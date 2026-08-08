import { describe, expect, test } from 'vitest';
import type { ApiClient } from '../../support/fixtures';
import { getBaseUrl, getData, getOwnerClient } from '../../support/fixtures';

// Regression coverage for THOTH-069: a record page added to a `DataView` hosted on a subpage
// used to show a truncated breadcrumb trail (missing the workspace root) when the underlying
// data source/view ended up in a different workspace than the hosting page — e.g. because the
// data source was created without an explicit `workspaceId` and fell back to the caller's
// default (most-recently-updated) workspace, rather than the workspace of the page currently
// being viewed. The fix makes the data-source-creation client (`DataSourceSelector`) always
// pass the current workspace explicitly; this test locks in the server-side contract that a
// data source/view created with a consistent, explicit `workspaceId` produces a full
// [root, subpage, row] breadcrumb trail, and that a genuinely orphaned/mismatched data source
// degrades gracefully (terminates the trail) rather than erroring.

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

async function createWorkspace(client: ApiClient, name: string) {
  const response = await client.post('/api/v1/workspaces', { name });
  expect(response.ok).toBe(true);
  return getData<{ id: string; slug: string }>(response);
}

async function createPage(client: ApiClient, data: { name: string; workspaceId?: string; parentId?: string | null }) {
  const response = await client.post('/api/v1/pages', {
    emoji: null,
    parentId: data.parentId ?? null,
    ...data,
  });
  expect(response.ok).toBe(true);
  return getData<{ id: string; name: string; workspaceId?: string }>(response);
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

async function createView(
  client: ApiClient,
  data: { name: string; workspaceId: string; dataSourceId: string; pageId: string }
) {
  const response = await client.post('/api/v1/views', data);
  expect(response.ok).toBe(true);
  return getData<{ id: string }>(response);
}

async function getBreadcrumbs(client: ApiClient, pageId: string) {
  const response = await client.get(`/api/v1/pages/${pageId}/breadcrumbs`);
  expect(response.ok).toBe(true);
  return getData<Array<{ id: string; name: string }>>(response);
}

describe('GET /pages/:id/breadcrumbs (THOTH-069)', () => {
  test('a row added to a view hosted on a subpage shows the full [root, subpage, row] trail', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-069 Breadcrumb ${unique}`);

    const root = await createPage(client, { name: `Root ${unique}`, workspaceId: workspace.id });
    const subpage = await createPage(client, { name: `Subpage ${unique}`, parentId: root.id });

    // Consistently, explicitly scoped to the same workspace as the hosting subpage — mirrors
    // the fixed `DataSourceSelector`/`ViewCreator` client behavior.
    const dataSource = await createDataSource(client, workspace.id, `DS ${unique}`);
    await createView(client, {
      name: `View ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: subpage.id,
    });

    const row = await createPage(client, { name: `Row ${unique}`, parentId: dataSource.id });

    const breadcrumbs = await getBreadcrumbs(client, row.id);
    expect(breadcrumbs.map((page) => page.name)).toEqual([root.name, subpage.name, row.name]);
  });

  test('a data source with no active view produces a single-entry trail without erroring', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-069 Orphan DS ${unique}`);

    // A data source with no hosting page/view at all (`findHostPageForDataSource` returns
    // `null`) — the trail should terminate gracefully at the row itself.
    const dataSource = await createDataSource(client, workspace.id, `Orphan DS ${unique}`);
    const row = await createPage(client, { name: `Orphan Row ${unique}`, parentId: dataSource.id });

    const breadcrumbs = await getBreadcrumbs(client, row.id);
    expect(breadcrumbs.map((page) => page.name)).toEqual([row.name]);
  });

  test('a soft-deleted view hosting the data source is excluded, degrading gracefully', async () => {
    const client = await getOwner();
    const unique = Date.now();
    const workspace = await createWorkspace(client, `THOTH-069 Deleted View ${unique}`);

    const root = await createPage(client, { name: `Root Deleted ${unique}`, workspaceId: workspace.id });
    const subpage = await createPage(client, { name: `Subpage Deleted ${unique}`, parentId: root.id });

    const dataSource = await createDataSource(client, workspace.id, `DS Deleted ${unique}`);
    const view = await createView(client, {
      name: `View Deleted ${unique}`,
      workspaceId: workspace.id,
      dataSourceId: dataSource.id,
      pageId: subpage.id,
    });

    const row = await createPage(client, { name: `Row Deleted ${unique}`, parentId: dataSource.id });

    // Soft-delete the only view hosting this data source — `findHostPageForDataSource` must
    // exclude it and the trail should terminate at the row rather than throwing.
    const deleteResponse = await client.delete(`/api/v1/views/${view.id}`);
    expect(deleteResponse.ok).toBe(true);

    const breadcrumbs = await getBreadcrumbs(client, row.id);
    expect(breadcrumbs.map((page) => page.name)).toEqual([row.name]);
  });
});
