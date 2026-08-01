import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

async function getData<T = unknown>(response: APIResponse): Promise<T> {
  const body = await response.json();
  return body.data as T;
}

type PageApi = { id: string };

async function createPage(request: APIRequestContext, name: string): Promise<string> {
  // Nested under the seeded root page rather than created at root level: root-level pages are
  // sorted by `lastAccessedAt` in the sidebar's cursor-paginated root list, and viewing one via
  // `page.goto` bumps it to "most recently accessed" — which would otherwise displace the
  // deterministic ordering `pages-tree-pagination.spec.ts` relies on (`SEED.pages.paginationSeed`).
  const response = await request.post('/api/v1/pages', {
    data: { name, emoji: null, parentId: SEED.pages.root.id, workspaceId: SEED.workspace.id },
  });
  expect(response.ok()).toBeTruthy();
  const page = await getData<PageApi>(response);
  return page.id;
}

// Covers THOTH-043: per-page revision history — recording on content/values saves, the history
// drawer's timeline + diff view, and the restore/fork actions. Each test creates its own fresh
// page via the API so the seeded, shared pages used by other specs are never mutated.
test.describe('page history', () => {
  test('records a revision on content save and shows it in the history drawer', async ({ page, request }) => {
    const pageId = await createPage(request, 'E2E History Page');

    const firstSave = await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'Hello world' } });
    expect(firstSave.ok()).toBeTruthy();

    const historyResponse = await request.get(`/api/v1/pages/${pageId}/history`);
    expect(historyResponse.ok()).toBeTruthy();
    const history = await getData<{ revisions: Array<{ id: string; target: string }> }>(historyResponse);
    expect(history.revisions.length).toBeGreaterThan(0);
    expect(history.revisions.every((revision) => revision.target === 'content')).toBe(true);

    await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
    await page.getByRole('button', { name: 'View page history' }).click();
    await expect(page.getByRole('heading', { name: 'Page history' })).toBeVisible();
    await expect(page.getByText('Content').first()).toBeVisible();
  });

  test('selecting a content revision shows a diff and can restore it', async ({ page, request }) => {
    const pageId = await createPage(request, 'E2E History Restore Page');

    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'Original content' } });
    const secondSave = await request.post(`/api/v1/pages/${pageId}/content`, {
      data: { content: 'Updated content' },
    });
    expect(secondSave.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
    await page.getByRole('button', { name: 'View page history' }).click();
    await expect(page.getByRole('heading', { name: 'Page history' })).toBeVisible();

    const rows = page.locator('[class*="revisionRow"]');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
    await page.getByRole('button', { name: 'Restore' }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Restore this revision?' });
    await expect(confirmDialog).toBeVisible();
    const [restoreResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/restore') && response.request().method() === 'POST'),
      confirmDialog.getByRole('button', { name: 'Restore', exact: true }).click(),
    ]);
    expect(restoreResponse.ok()).toBeTruthy();

    await expect(page.getByText('Revision restored')).toBeVisible();
  });

  test('can fork a historical revision into a new page', async ({ page, request }) => {
    const pageId = await createPage(request, 'E2E History Fork Page');

    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'Fork me' } });

    await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
    await page.getByRole('button', { name: 'View page history' }).click();

    const rows = page.locator('[class*="revisionRow"]');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    await page.getByRole('button', { name: 'Create new page from this version' }).click();

    const forkDialog = page.getByRole('dialog', { name: 'Create new page from this version' });
    await expect(forkDialog).toBeVisible();
    const [forkResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/fork') && response.request().method() === 'POST'),
      forkDialog.getByRole('button', { name: 'Create page' }).click(),
    ]);
    expect(forkResponse.ok()).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(String.raw`/${SEED.workspace.slug}/pages/(?!${pageId})[\w-]+$`), {
      timeout: 10_000,
    });
  });

  test('records a revision on values save', async ({ request }) => {
    const noteColumn = SEED.dataSource.columns[0];
    const pageResponse = await request.post('/api/v1/pages', {
      data: {
        name: 'E2E History Values Page',
        emoji: null,
        parentId: SEED.dataSource.id,
        workspaceId: SEED.workspace.id,
      },
    });
    expect(pageResponse.ok()).toBeTruthy();
    const pageEntity = await getData<PageApi>(pageResponse);

    const valuesResponse = await request.patch(`/api/v1/pages/${pageEntity.id}/values`, {
      data: { [noteColumn.id]: { type: 'string', value: 'Done' } },
    });
    expect(valuesResponse.ok()).toBeTruthy();

    const historyResponse = await request.get(`/api/v1/pages/${pageEntity.id}/history?target=values`);
    expect(historyResponse.ok()).toBeTruthy();
    const history = await getData<{ revisions: Array<{ target: string; changedColumns?: string[] }> }>(historyResponse);
    expect(history.revisions.length).toBe(1);
    expect(history.revisions[0]?.target).toBe('values');
    expect(history.revisions[0]?.changedColumns).toContain(noteColumn.id);
  });
});
