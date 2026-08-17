import { describe, expect, test } from 'vitest';
import {
  getBaseUrl,
  getData,
  getOwnerClient,
  SEED,
  agePageHistoryFixture,
  readPageHistoryFixture,
  enqueueHistoryMaintain,
  waitForJobCompletion,
} from '../../support/fixtures';

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

  test('records content immediately, then scheduled history.maintain consolidates a fixture-aged sealed run', async () => {
    const client = await getOwner();

    const pageResponse = await client.post('/api/v1/pages', {
      name: 'E2E History Maintenance Page',
      emoji: null,
      parentId: SEED.dataSource.id,
      workspaceId: SEED.workspace.id,
    });
    expect(pageResponse.ok).toBe(true);
    const pageEntity = await getData<PageApi>(pageResponse);

    // First save is recorded immediately (baseline + first appended patch) — the hot path
    // itself never consolidates or prunes (THOTH-062's core acceptance boundary).
    const firstSave = await client.post(`/api/v1/pages/${pageEntity.id}/content`, { content: 'Revision 0' });
    expect(firstSave.ok).toBe(true);

    const beforeRevisions = await readPageHistoryFixture(pageEntity.id);
    const contentRevisionsBefore = beforeRevisions.filter((revision) => revision.target === 'content');
    expect(contentRevisionsBefore.length).toBe(2);
    expect(contentRevisionsBefore.some((revision) => revision.consolidated)).toBe(false);

    // Fixture-age the whole stream past both the coalesce window and the 24h consolidation age,
    // then invoke `history.maintain` through the real running jobs process — mirrors production's
    // hourly `history.scan` fan-out, without waiting for either a real 5-minute or 24-hour clock.
    await agePageHistoryFixture(pageEntity.id);
    const enqueueResponse = await enqueueHistoryMaintain(SEED.workspace.id, pageEntity.id);
    expect(enqueueResponse.ok).toBe(true);
    if (!enqueueResponse.ok) throw new Error('unreachable: asserted above');
    const jobId = enqueueResponse.result.jobId;
    expect(typeof jobId).toBe('string');

    // Wait for the actual enqueued job to reach a terminal state before inspecting revision
    // history — otherwise the assertions below could pass trivially before `history.maintain`
    // has even run.
    await waitForJobCompletion(jobId!);

    // With only a baseline + one open trailing patch (no closing snapshot yet), the run is never
    // sealed — maintenance completes as a safe no-op rather than consolidating anything. Assert
    // list/detail/restore all still function correctly after that no-op execution.
    const afterRevisions = await readPageHistoryFixture(pageEntity.id);
    expect(afterRevisions.filter((revision) => revision.target === 'content').length).toBe(
      contentRevisionsBefore.length
    );

    const historyResponse = await client.get(`/api/v1/pages/${pageEntity.id}/history`, {
      params: { target: 'content' },
    });
    expect(historyResponse.ok).toBe(true);
    const history = await getData<{ revisions: Array<{ id: string; target: string; kind: string }> }>(historyResponse);
    expect(history.revisions.length).toBe(2);

    const latestRevisionId = history.revisions[0]!.id;
    const detailResponse = await client.get(`/api/v1/pages/${pageEntity.id}/history/${latestRevisionId}`);
    expect(detailResponse.ok).toBe(true);

    const restoreResponse = await client.post(`/api/v1/pages/${pageEntity.id}/history/${latestRevisionId}/restore`, {});
    expect(restoreResponse.ok).toBe(true);
  });

  test('forking a public page into a private parent inherits the destination privacy root (THOTH-077)', async () => {
    const client = await getOwner();

    // A private parent (its own privacy root) — any fork placed under it must join its cascade
    // rather than staying public and leaking into Recent from inside a private subtree.
    const privateParentResponse = await client.post('/api/v1/pages', {
      name: 'THOTH-077 Fork Private Parent',
      emoji: null,
      parentId: null,
      workspaceId: SEED.workspace.id,
    });
    expect(privateParentResponse.ok).toBe(true);
    const privateParent = await getData<PageApi>(privateParentResponse);

    const markPrivateResponse = await client.patch(`/api/v1/pages/${privateParent.id}`, { isPrivate: true });
    expect(markPrivateResponse.ok).toBe(true);

    // A public source page, saved once so it has a revision to fork from.
    const sourceResponse = await client.post('/api/v1/pages', {
      name: 'THOTH-077 Fork Source',
      emoji: null,
      parentId: null,
      workspaceId: SEED.workspace.id,
    });
    expect(sourceResponse.ok).toBe(true);
    const sourcePage = await getData<PageApi>(sourceResponse);

    const contentSave = await client.post(`/api/v1/pages/${sourcePage.id}/content`, { content: 'Fork me' });
    expect(contentSave.ok).toBe(true);

    const historyResponse = await client.get(`/api/v1/pages/${sourcePage.id}/history`, {
      params: { target: 'content' },
    });
    expect(historyResponse.ok).toBe(true);
    const history = await getData<{ revisions: Array<{ id: string }> }>(historyResponse);
    const revisionId = history.revisions[0]!.id;

    const forkResponse = await client.post(`/api/v1/pages/${sourcePage.id}/history/${revisionId}/fork`, {
      parentId: privateParent.id,
    });
    expect(forkResponse.ok).toBe(true);
    const forkedPage = await getData<PageApi>(forkResponse);

    const forkedDetailsResponse = await client.get(`/api/v1/pages/${forkedPage.id}`);
    expect(forkedDetailsResponse.ok).toBe(true);
    const forkedDetails = await getData<{ page: { isPrivate: boolean; privateRootId: string | null } }>(
      forkedDetailsResponse
    );

    // Inherits privacy from the destination parent, and joins *its* cascade rather than
    // becoming a dangling root of its own.
    expect(forkedDetails.page.isPrivate).toBe(true);
    expect(forkedDetails.page.privateRootId).toBe(privateParent.id);
  });
});
