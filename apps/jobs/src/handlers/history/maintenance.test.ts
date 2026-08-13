import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import {
  createDatabaseContext,
  setDatabaseContext,
  resetDatabaseContext,
  getContainerRepository,
  getPageRevisionRepository,
} from '@thoth/database';
import { reconstructAt, makePatch, COALESCE_WINDOW_MS, MAX_REVISIONS } from '@thoth/shared';
import type { PageContainer, PageRevisionKind } from '@thoth/database/types';
import { maintainPageHistory } from './maintenance.js';

const WORKSPACE_ID = 'workspace-1';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

describe('maintenance', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let pageCounter = 0;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-history-maintenance-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));
    containerRepository = await getContainerRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createTestPage(overrides: Partial<PageContainer> = {}): Promise<PageContainer> {
    pageCounter += 1;
    const now = new Date().toISOString();
    const pageData = {
      name: `Test page ${pageCounter}`,
      type: 'page' as const,
      parentId: null,
      workspaceId: WORKSPACE_ID,
      userId: 'user-1',
      emoji: null,
      content: '',
      values: {},
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      ...overrides,
    };
    const created = await containerRepository.create(pageData);
    return created as PageContainer;
  }

  type RevisionInput = {
    containerId: string;
    target: 'content' | 'values';
    sequence: number;
    previousSequence: number | null;
    kind: PageRevisionKind;
    content?: string;
    patch?: string;
    valuesBefore?: string;
    author?: string;
    createdAt: string;
    coalesceWindowEnd?: string;
    consolidated?: boolean;
  };

  async function createRevision(input: RevisionInput) {
    const repo = await getPageRevisionRepository();
    return repo.create({
      containerId: input.containerId,
      sequence: input.sequence,
      previousSequence: input.previousSequence,
      kind: input.kind,
      target: input.target,
      content: input.content ?? '',
      patch: input.patch ?? '',
      valuesBefore: input.valuesBefore ?? '',
      author: input.author ?? 'user-1',
      charsAdded: 0,
      charsRemoved: 0,
      coalesceWindowEnd: input.coalesceWindowEnd ?? input.createdAt,
      consolidated: input.consolidated ?? false,
      userId: 'user-1',
      workspaceId: WORKSPACE_ID,
      createdAt: input.createdAt,
      lastUpdated: input.createdAt,
    });
  }

  test('returns a no-op when the page is missing', async () => {
    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: 'does-not-exist' });
    expect(outcome).toEqual({ status: 'no-op', reason: 'page-missing' });
  });

  test('returns a no-op for a soft-deleted page', async () => {
    const page = await createTestPage({ deletedAt: new Date().toISOString(), lastUpdated: hoursAgo(48) });
    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome).toEqual({ status: 'no-op', reason: 'page-deleted' });
  });

  test('defers when the page was updated within the coalesce window', async () => {
    const page = await createTestPage({ lastUpdated: new Date().toISOString() });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 1,
      previousSequence: null,
      kind: 'snapshot',
      content: 'hello',
      createdAt: new Date().toISOString(),
      coalesceWindowEnd: new Date(Date.now() + COALESCE_WINDOW_MS).toISOString(),
    });
    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('stale');
  });

  test('detects a malformed (gapped) chain and never mutates', async () => {
    const page = await createTestPage({ lastUpdated: hoursAgo(48) });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 1,
      previousSequence: null,
      kind: 'snapshot',
      content: 'a',
      createdAt: hoursAgo(48),
    });
    // Gap: sequence 3 with no sequence 2.
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 3,
      previousSequence: 1,
      kind: 'patch',
      patch: makePatch('a', 'ab'),
      createdAt: hoursAgo(47),
    });

    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.malformedStreams).toContain('content');
      expect(outcome.runsConsolidated).toBe(0);
      expect(outcome.rowsPruned).toBe(0);
    }

    const repo = await getPageRevisionRepository();
    const revisions = await repo.getByQuery(repo.createQuery().eq('containerId', page.id).eq('target', 'content'));
    expect(revisions.length).toBe(2); // nothing deleted
  });

  test('consolidates a sealed aged run into one baseline while preserving reconstruction', async () => {
    const page = await createTestPage({ lastUpdated: hoursAgo(48) });
    const states = ['a', 'ab', 'abc', 'abcd', 'abcde'];
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 1,
      previousSequence: null,
      kind: 'snapshot',
      content: states[0]!,
      createdAt: hoursAgo(48),
    });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 2,
      previousSequence: 1,
      kind: 'patch',
      patch: makePatch(states[0]!, states[1]!),
      createdAt: hoursAgo(47),
    });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 3,
      previousSequence: 2,
      kind: 'patch',
      patch: makePatch(states[1]!, states[2]!),
      createdAt: hoursAgo(46),
    });
    // Sealing baseline — old enough that the source page itself is quiet, but young enough (its
    // own coalesce window has still elapsed by "now") to still be the live head... use an
    // elapsed coalesceWindowEnd so maintenance isn't deferred.
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 4,
      previousSequence: 3,
      kind: 'snapshot',
      content: states[3]!,
      createdAt: hoursAgo(2),
      coalesceWindowEnd: hoursAgo(1),
    });

    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.runsConsolidated).toBe(1);
    }

    const repo = await getPageRevisionRepository();
    const revisions = await repo.getByQuery(
      repo.createQuery().eq('containerId', page.id).eq('target', 'content').sort('sequence', 'asc')
    );
    // Two patches (seq 2,3) collapsed into one consolidated row at seq 3; seq 1 and seq 4 baselines untouched.
    expect(revisions.length).toBe(3);
    const consolidated = revisions.find((revision) => revision.sequence === 3);
    expect(consolidated?.kind).toBe('consolidated');
    expect(consolidated?.content).toBe(states[2]);

    expect(reconstructAt(revisions, 1)).toBe(states[0]);
    expect(reconstructAt(revisions, 3)).toBe(states[2]);
    expect(reconstructAt(revisions, 4)).toBe(states[3]);
  });

  test('is idempotent when re-run after a crash between conversion and delete', async () => {
    const page = await createTestPage({ lastUpdated: hoursAgo(48) });
    const states = ['a', 'ab', 'abc', 'abcd'];
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 1,
      previousSequence: null,
      kind: 'snapshot',
      content: states[0]!,
      createdAt: hoursAgo(48),
    });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 2,
      previousSequence: 1,
      kind: 'patch',
      patch: makePatch(states[0]!, states[1]!),
      createdAt: hoursAgo(47),
    });
    // Simulate a crash: sequence 3 (originally a patch) was already converted to `consolidated`
    // by a prior partial execution, but the earlier patch at sequence 2 was never deleted.
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 3,
      previousSequence: 1,
      kind: 'consolidated',
      content: states[2]!,
      createdAt: hoursAgo(46),
      consolidated: true,
    });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 4,
      previousSequence: 3,
      kind: 'snapshot',
      content: states[3]!,
      createdAt: hoursAgo(2),
      coalesceWindowEnd: hoursAgo(1),
    });

    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('completed');

    const repo = await getPageRevisionRepository();
    const revisions = await repo.getByQuery(
      repo.createQuery().eq('containerId', page.id).eq('target', 'content').sort('sequence', 'asc')
    );
    // The crash left an orphaned single-patch run (sequence 2) sealed by the already-converted
    // consolidated row at sequence 3; a safe re-run converts it into its own consolidated
    // baseline in place rather than corrupting/duplicating anything — every sequence must still
    // reconstruct correctly and no row is ever left as a duplicate/gapped/patch-kind leftover.
    expect(revisions.length).toBe(4);
    expect(revisions.every((revision) => revision.kind !== 'patch')).toBe(true);
    expect(reconstructAt(revisions, 1)).toBe(states[0]);
    expect(reconstructAt(revisions, 3)).toBe(states[2]);
    expect(reconstructAt(revisions, 4)).toBe(states[3]);

    // Re-running again must be a stable no-op (no further rows removed/changed): every row is
    // now a baseline, so there's nothing left for `selectAllConsolidationRuns` to find.
    const secondOutcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(secondOutcome.status).toBe('completed');
    if (secondOutcome.status === 'completed') {
      expect(secondOutcome.runsConsolidated).toBe(0);
    }
  });

  test('prunes only the oldest excess values revisions beyond MAX_REVISIONS', async () => {
    const page = await createTestPage({ lastUpdated: hoursAgo(48) });
    const total = MAX_REVISIONS + 3;
    for (let sequence = 1; sequence <= total; sequence += 1) {
      await createRevision({
        containerId: page.id,
        target: 'values',
        sequence,
        previousSequence: sequence === 1 ? null : sequence - 1,
        kind: 'patch',
        valuesBefore: JSON.stringify({ title: null }),
        createdAt: hoursAgo(48 - sequence * 0.001),
      });
    }

    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.rowsPruned).toBeGreaterThanOrEqual(3);
    }

    const repo = await getPageRevisionRepository();
    const remaining = await repo.getByQuery(
      repo.createQuery().eq('containerId', page.id).eq('target', 'values').sort('sequence', 'asc')
    );
    expect(remaining.length).toBeLessThanOrEqual(MAX_REVISIONS);
    // The oldest surviving row must be one of the later sequences, never sequence 1.
    expect(remaining[0]!.sequence).toBeGreaterThan(1);

    // Re-running maintenance after the stream has already been pruned must not report it as
    // malformed — the surviving stream no longer starts at sequence 1, and `isChainValid` must
    // validate contiguity relative to the first surviving sequence rather than assuming 1.
    const secondOutcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(secondOutcome.status).toBe('completed');
    if (secondOutcome.status === 'completed') {
      expect(secondOutcome.malformedStreams).not.toContain('values');
    }
  }, 20_000);

  test('prunes only the allowed oldest excess content revisions beyond MAX_REVISIONS, keeping the second-oldest baseline', async () => {
    const page = await createTestPage({ lastUpdated: hoursAgo(48) });
    const total = MAX_REVISIONS + 3;

    // Two baselines: the very first row (sequence 1) and a second one part-way through, so
    // retention has somewhere safe to stop (never dropping below the second-oldest baseline).
    const secondBaselineSequence = 2;
    for (let sequence = 1; sequence <= total; sequence += 1) {
      const isBaseline = sequence === 1 || sequence === secondBaselineSequence;
      await createRevision({
        containerId: page.id,
        target: 'content',
        sequence,
        previousSequence: sequence === 1 ? null : sequence - 1,
        kind: isBaseline ? 'snapshot' : 'patch',
        ...(isBaseline ? { content: `content-${sequence}` } : { patch: makePatch('', `content-${sequence}`) }),
        createdAt: hoursAgo(48 - sequence * 0.001),
      });
    }

    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.rowsPruned).toBeGreaterThan(0);
    }

    const repo = await getPageRevisionRepository();
    const remaining = await repo.getByQuery(
      repo.createQuery().eq('containerId', page.id).eq('target', 'content').sort('sequence', 'asc')
    );
    // Only rows below the second-oldest baseline may ever be pruned for `content` — the baseline
    // itself (sequence 2) and everything from it onward must still survive.
    expect(remaining.some((revision) => revision.sequence === secondBaselineSequence)).toBe(true);
    expect(remaining.every((revision) => revision.sequence >= secondBaselineSequence)).toBe(true);
    expect(remaining.length).toBe(total - (secondBaselineSequence - 1));
  }, 20_000);

  test('does not prune content with fewer than two baselines', async () => {
    const page = await createTestPage({ lastUpdated: hoursAgo(48) });
    await createRevision({
      containerId: page.id,
      target: 'content',
      sequence: 1,
      previousSequence: null,
      kind: 'snapshot',
      content: 'only baseline',
      createdAt: hoursAgo(48),
      coalesceWindowEnd: hoursAgo(47),
    });

    const outcome = await maintainPageHistory({ workspaceId: WORKSPACE_ID, containerId: page.id });
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.rowsPruned).toBe(0);
    }
  });
});
