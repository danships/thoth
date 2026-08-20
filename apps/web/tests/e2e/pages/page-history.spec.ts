import Database from 'better-sqlite3';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import { enqueueJob } from '@thoth/job-protocol';

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

// "View History" lives at the top of the page detail screen's "..." dropdown menu (rather than
// its own standalone icon), so opening the history drawer is a two-step interaction.
async function openHistoryDrawer(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Page menu' }).click();
  await page.getByRole('menuitem', { name: 'View History' }).click();
}

function getDatabase(): InstanceType<typeof Database> {
  const databasePath = process.env['DB']!.replace('sqlite://', '');
  const database = new Database(databasePath);
  // Retry briefly on a transient lock instead of throwing immediately — the live dev server's
  // own connection is writing concurrently throughout the suite.
  database.pragma('busy_timeout = 5000');
  return database;
}

/** Backdates the live `target: 'content'` head row's `coalesceWindowEnd` so the *next* content
 * save appends a brand-new revision instead of coalescing into it (THOTH-062 fixture helper —
 * avoids a real 5-minute wait between saves). */
function forceNextSaveToAppend(pageId: string): void {
  const database = getDatabase();
  try {
    const head = database
      .prepare(
        `SELECT id FROM page_revision WHERE "containerId" = ? AND target = 'content' ORDER BY sequence DESC LIMIT 1`
      )
      .get(pageId) as { id: string } | undefined;
    if (head) {
      database
        .prepare(`UPDATE page_revision SET contents = json_set(contents, '$.coalesceWindowEnd', ?) WHERE id = ?`)
        .run(new Date(Date.now() - 1000).toISOString(), head.id);
    }
  } finally {
    database.close();
  }
}

/** Backdates every `page-revision` row and the page's own `lastUpdated` for `pageId` well past
 * both the 5-minute coalesce window and the 24-hour consolidation age, so scheduled maintenance
 * sees a quiet page with a sealed, eligible content run (THOTH-062). */
function agePageHistory(pageId: string): void {
  const database = getDatabase();
  try {
    const backdated = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    database
      .prepare(
        `UPDATE page_revision
         SET contents = json_set(contents, '$.createdAt', ?, '$.lastUpdated', ?, '$.coalesceWindowEnd', ?)
         WHERE "containerId" = ?`
      )
      .run(backdated, backdated, backdated, pageId);
    database
      .prepare(`UPDATE container SET contents = json_set(contents, '$.lastUpdated', ?) WHERE id = ?`)
      .run(backdated, pageId);
  } finally {
    database.close();
  }
}

/** Polls the existing history HTTP API (rather than a raw `better-sqlite3` connection, which
 * would otherwise compete for file locks with the live dev server's own connection across a long
 * shared-suite run) until at least one `consolidated` revision appears for `pageId` — the
 * observable side effect of `history.maintain` actually running — or throws on timeout. */
async function waitForConsolidation(request: APIRequestContext, pageId: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await request.get(`/api/v1/pages/${pageId}/history`, {
      params: { target: 'content', limit: '50' },
    });
    if (response.ok()) {
      const history = await getData<{ revisions: Array<{ id: string; kind: string }> }>(response);
      if (history.revisions.some((revision) => revision.kind === 'consolidated')) return;
    }
    if (Date.now() > deadline) {
      expect(response.ok()).toBeTruthy();
      throw new Error(
        `waitForConsolidation: no consolidated revision appeared for page ${pageId} within ${timeoutMs}ms`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Covers THOTH-043: per-page revision history — recording on content/values saves, the history
// drawer's timeline + diff view, and the restore/fork actions. Each test creates its own fresh
// page via the API so the seeded, shared pages used by other specs are never mutated.
test.describe('page history', () => {
  // THOTH-075: the "Column" cell in the values diff table must show the column's display name,
  // not its raw id — and fall back to the id + a visible "(deleted)" remark once the column no
  // longer exists on the Data Source.
  test('shows the column name (not its id) in the values diff table', async ({ page, request }) => {
    const noteColumn = SEED.dataSource.columns[0]!;

    const pageResponse = await request.post('/api/v1/pages', {
      data: {
        name: 'E2E History Column Name Page',
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

    await page.goto(`/${SEED.workspace.slug}/pages/${pageEntity.id}`);
    await openHistoryDrawer(page);
    await expect(page.getByRole('heading', { name: 'Page history' })).toBeVisible();

    const rows = page.locator('[class*="revisionRow"]');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('cell', { name: noteColumn.name, exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: noteColumn.id, exact: true })).toHaveCount(0);
  });

  test('shows the raw column id with a "(deleted)" remark once the column is removed from the Data Source', async ({
    page,
    request,
  }) => {
    // A dedicated Data Source + column (rather than the shared `SEED.dataSource`) so deleting the
    // column here can't affect other specs relying on the seeded columns still existing.
    const dataSourceResponse = await request.post('/api/v1/data-sources', {
      data: { name: 'E2E History Deleted Column Data Source', workspaceId: SEED.workspace.id },
    });
    expect(dataSourceResponse.ok()).toBeTruthy();
    const dataSource = await getData<{ id: string }>(dataSourceResponse);

    const columnResponse = await request.post(`/api/v1/data-sources/${dataSource.id}/columns`, {
      data: { name: 'Soon Deleted', type: 'string' },
    });
    expect(columnResponse.ok()).toBeTruthy();
    const column = await getData<{ id: string; name: string }>(columnResponse);

    const pageResponse = await request.post('/api/v1/pages', {
      data: {
        name: 'E2E History Deleted Column Page',
        emoji: null,
        parentId: dataSource.id,
        workspaceId: SEED.workspace.id,
      },
    });
    expect(pageResponse.ok()).toBeTruthy();
    const pageEntity = await getData<PageApi>(pageResponse);

    const valuesResponse = await request.patch(`/api/v1/pages/${pageEntity.id}/values`, {
      data: { [column.id]: { type: 'string', value: 'Before delete' } },
    });
    expect(valuesResponse.ok()).toBeTruthy();

    const deleteColumnResponse = await request.delete(`/api/v1/data-sources/${dataSource.id}/columns/${column.id}`);
    expect(deleteColumnResponse.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${pageEntity.id}`);
    await openHistoryDrawer(page);
    await expect(page.getByRole('heading', { name: 'Page history' })).toBeVisible();

    const rows = page.locator('[class*="revisionRow"]');
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByText(column.id)).toBeVisible();
    await expect(table.getByText('(deleted)')).toBeVisible();
  });

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
    await openHistoryDrawer(page);
    await expect(page.getByRole('heading', { name: 'Page history' })).toBeVisible();
    const rows = page.locator('[class*="revisionRow"]');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first().getByText('Content')).toBeVisible();
  });

  test('shows only the selected revision change instead of the cumulative diff against live content', async ({
    page,
    request,
  }) => {
    const pageId = await createPage(request, 'THOTH-084 History Diff Page');

    const baseResponse = await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'Base text' } });
    expect(baseResponse.ok()).toBeTruthy();
    forceNextSaveToAppend(pageId);
    const middleResponse = await request.post(`/api/v1/pages/${pageId}/content`, {
      data: { content: 'Base text\nMiddle-only addition' },
    });
    expect(middleResponse.ok()).toBeTruthy();
    forceNextSaveToAppend(pageId);
    const finalResponse = await request.post(`/api/v1/pages/${pageId}/content`, {
      data: { content: 'Base text\nMiddle-only addition\nLater-only addition' },
    });
    expect(finalResponse.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
    await openHistoryDrawer(page);
    const rows = page.locator('[class*="revisionRow"]');
    // Newest-first rows are sequence 4, then this middle sequence-3 change.
    await expect(rows.nth(1)).toBeVisible();
    await rows.nth(1).click();

    const diffPanel = page.locator('[class*="diffPanel"]');
    await expect(diffPanel).toContainText('Middle-only addition');
    await expect(diffPanel).not.toContainText('Later-only addition');
  });

  test('selecting a content revision shows a diff and can restore it', async ({ page, request }) => {
    const pageId = await createPage(request, 'E2E History Restore Page');

    await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'Original content' } });
    const secondSave = await request.post(`/api/v1/pages/${pageId}/content`, {
      data: { content: 'Updated content' },
    });
    expect(secondSave.ok()).toBeTruthy();

    await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
    await openHistoryDrawer(page);
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
    await openHistoryDrawer(page);

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

  // THOTH-062: history consolidation/retention moved out of the synchronous save path into
  // scheduled `history.maintain`. This is the one end-to-end regression proving that after a
  // page accumulates a sealed, aged-out patch run and scheduled maintenance actually
  // consolidates it, reconstruction/restore/fork through the drawer still work correctly —
  // exercised via the test-only `history.maintain` job schema and a fixture-backdated history
  // (no production maintenance endpoint, no separate spec file).
  test('reconstructs, restores, and forks correctly after scheduled history maintenance consolidates aged revisions', async ({
    page,
    request,
  }) => {
    // Wider bound than the suite default: this test enqueues a real `history.maintain` job onto
    // the shared jobs process used by the whole e2e run, so it may briefly wait behind other
    // queued work under a busy/long-running suite rather than a fixed short poll.
    test.setTimeout(90_000);
    const pageId = await createPage(request, 'E2E History Maintenance Page');

    // First save lazily creates the baseline (seq 1, snapshot) + first appended patch (seq 2).
    const firstSave = await request.post(`/api/v1/pages/${pageId}/content`, { data: { content: 'Revision 0' } });
    expect(firstSave.ok()).toBeTruthy();

    // Force enough appended (non-coalesced) content revisions that the automatic snapshot
    // (every `SNAPSHOT_INTERVAL` = 20th appended revision) closes off — "seals" — a run of
    // patches. Each save's coalesce window is backdated first so it appends a new revision
    // rather than merging into the still-open head, without needing a real 5-minute wait.
    for (let index = 1; index <= 19; index += 1) {
      forceNextSaveToAppend(pageId);
      const saveResponse = await request.post(`/api/v1/pages/${pageId}/content`, {
        data: { content: `Revision ${index}` },
      });
      expect(saveResponse.ok()).toBeTruthy();
    }

    const beforeHistoryResponse = await request.get(`/api/v1/pages/${pageId}/history`, {
      params: { target: 'content', limit: '50' },
    });
    expect(beforeHistoryResponse.ok()).toBeTruthy();
    const beforeHistory = await getData<{ revisions: Array<{ id: string; kind: string }> }>(beforeHistoryResponse);
    // 1 baseline snapshot + 20 appended revisions (one of them the automatic 20th-sequence
    // snapshot that seals the run) — none consolidated yet.
    expect(beforeHistory.revisions.length).toBe(21);
    expect(beforeHistory.revisions.some((revision) => revision.kind === 'consolidated')).toBe(false);

    // Fixture-age the whole stream + page past the coalesce window and the 24h consolidation
    // age, then enqueue `history.maintain` directly over the real running jobs process (the
    // test-only external job schema, gated to `NODE_ENV === 'test'`).
    agePageHistory(pageId);
    const enqueueResponse = await enqueueJob(
      { type: 'history.maintain', payloadVersion: 1, payload: { workspaceId: SEED.workspace.id, containerId: pageId } },
      { socketPath: process.env['JOB_SOCKET_PATH']! }
    );
    expect(enqueueResponse.ok).toBe(true);

    await waitForConsolidation(request, pageId);

    const afterHistoryResponse = await request.get(`/api/v1/pages/${pageId}/history`, {
      params: { target: 'content', limit: '50' },
    });
    expect(afterHistoryResponse.ok()).toBeTruthy();
    const afterHistory = await getData<{ revisions: Array<{ id: string; kind: string }> }>(afterHistoryResponse);
    // The sealed run of patches collapsed into a single consolidated baseline: strictly fewer
    // rows than before, and at least one is now `consolidated`.
    expect(afterHistory.revisions.length).toBeLessThan(beforeHistory.revisions.length);
    expect(afterHistory.revisions.some((revision) => revision.kind === 'consolidated')).toBe(true);

    // Reopen the drawer and confirm the timeline still renders, and diff/restore/fork on the
    // latest surviving revision still work after maintenance touched the underlying rows.
    await page.goto(`/${SEED.workspace.slug}/pages/${pageId}`);
    await openHistoryDrawer(page);
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

    // Restoring closes the drawer — reopen it for the fork flow below.
    await openHistoryDrawer(page);
    await expect(page.getByRole('heading', { name: 'Page history' })).toBeVisible();
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
});
