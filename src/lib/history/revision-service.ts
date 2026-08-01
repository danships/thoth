import { getPageRevisionRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import type { PageContainer, PageRevision } from '@/types/database';
import type { PageValue } from '@/types/schemas/entities/container';
import { makePatch, summarise } from './delta';
import { reconstructAt, type ContentRevisionLike } from './reconstruct';
import { nextCoalesceWindowEnd, shouldCoalesce } from './coalesce';
import { selectConsolidationRun } from './consolidate';
import { MAX_PATCH_BYTES, MAX_REVISIONS, SNAPSHOT_INTERVAL } from './constants';

async function loadRevisions(containerId: string, target: 'content' | 'values'): Promise<PageRevision[]> {
  const repo = await getPageRevisionRepository();
  const revisions = await repo.getByQuery(
    repo.createQuery().eq('containerId', containerId).eq('target', target).sort('sequence', 'asc')
  );
  return revisions;
}

function toContentRevisionLike(revision: PageRevision): ContentRevisionLike {
  return { sequence: revision.sequence, kind: revision.kind, content: revision.content, patch: revision.patch };
}

/**
 * Decides how to store `newContent` against `baseContent`: a `patch` when it fits under
 * `MAX_PATCH_BYTES`, otherwise a full `snapshot` (content is inherently bounded at 1,000,000
 * chars, so a snapshot is always safe to store).
 */
export function buildContentFields(
  baseContent: string,
  newContent: string,
  forceSnapshot: boolean
): { kind: 'snapshot' | 'patch'; content: string; patch: string } {
  if (forceSnapshot) {
    return { kind: 'snapshot', content: newContent, patch: '' };
  }
  const patch = makePatch(baseContent, newContent);
  if (Buffer.byteLength(patch, 'utf8') > MAX_PATCH_BYTES) {
    return { kind: 'snapshot', content: newContent, patch: '' };
  }
  return { kind: 'patch', content: '', patch };
}

type RecordContentRevisionInput = {
  page: PageContainer;
  newContent: string;
  author: string;
};

/**
 * Creates a brand-new page's *only* starting revision: a single `snapshot` at sequence 1. Used
 * by fork (where the "prior" and "new" content are identical — there's no distinct edit to
 * record yet), unlike `recordContentRevision`'s first-save lazy-baseline path (used for
 * pre-existing pages) which deliberately writes two rows (the pre-edit baseline, then the edit).
 */
export async function createContentBaseline({
  page,
  content,
  author,
}: {
  page: PageContainer;
  content: string;
  author: string;
}): Promise<void> {
  const repo = await getPageRevisionRepository();
  const now = new Date().toISOString();

  await repo.create({
    containerId: page.id,
    sequence: 1,
    previousSequence: null,
    kind: 'snapshot',
    target: 'content',
    content,
    patch: '',
    valuesBefore: '',
    author,
    charsAdded: 0,
    charsRemoved: 0,
    coalesceWindowEnd: now,
    consolidated: false,
    userId: page.userId,
    workspaceId: page.workspaceId,
    createdAt: now,
    lastUpdated: now,
  });
}

/**
 * Records a save of a page's markdown `content` into its `target: 'content'` revision stream:
 * on the very first save it lazily creates a baseline snapshot of the pre-edit content (no
 * migration needed for pre-existing pages), otherwise either coalesces into the live head (same
 * author, still within the coalesce window) or appends a new revision — periodically as a full
 * baseline snapshot — and opportunistically consolidates one sealed aged run of patches.
 */
export async function recordContentRevision({ page, newContent, author }: RecordContentRevisionInput): Promise<void> {
  const repo = await getPageRevisionRepository();
  const now = new Date();
  const nowIso = now.toISOString();

  const revisions = await loadRevisions(page.id, 'content');

  if (revisions.length === 0) {
    const priorContent = page.content ?? '';

    await repo.create({
      containerId: page.id,
      sequence: 1,
      previousSequence: null,
      kind: 'snapshot',
      target: 'content',
      content: priorContent,
      patch: '',
      valuesBefore: '',
      author,
      ...summarise('', priorContent),
      coalesceWindowEnd: nowIso,
      consolidated: false,
      userId: page.userId,
      workspaceId: page.workspaceId,
      createdAt: nowIso,
      lastUpdated: nowIso,
    });

    const summary = summarise(priorContent, newContent);
    await repo.create({
      containerId: page.id,
      sequence: 2,
      previousSequence: 1,
      kind: 'patch',
      target: 'content',
      content: '',
      patch: makePatch(priorContent, newContent),
      valuesBefore: '',
      author,
      ...summary,
      coalesceWindowEnd: nextCoalesceWindowEnd(now),
      consolidated: false,
      userId: page.userId,
      workspaceId: page.workspaceId,
      createdAt: nowIso,
      lastUpdated: nowIso,
    });
    return;
  }

  const head = revisions.at(-1)!;

  if (shouldCoalesce(head, author, now)) {
    const priorRevisions = revisions.slice(0, -1);
    const baseContent =
      head.previousSequence === null
        ? ''
        : reconstructAt(
            priorRevisions.map((revision) => toContentRevisionLike(revision)),
            head.previousSequence
          );

    const forceSnapshot = head.sequence % SNAPSHOT_INTERVAL === 0;
    const fields = buildContentFields(baseContent, newContent, forceSnapshot);
    const summary = summarise(baseContent, newContent);

    await repo.update({
      ...head,
      ...fields,
      ...summary,
      coalesceWindowEnd: nextCoalesceWindowEnd(now),
      lastUpdated: nowIso,
    });
    return;
  }

  const baseContent = reconstructAt(
    revisions.map((revision) => toContentRevisionLike(revision)),
    head.sequence
  );
  const newSequence = head.sequence + 1;
  const forceSnapshot = newSequence % SNAPSHOT_INTERVAL === 0;
  const fields = buildContentFields(baseContent, newContent, forceSnapshot);
  const summary = summarise(baseContent, newContent);

  const created = await repo.create({
    containerId: page.id,
    sequence: newSequence,
    previousSequence: head.sequence,
    kind: fields.kind,
    target: 'content',
    content: fields.content,
    patch: fields.patch,
    valuesBefore: '',
    author,
    ...summary,
    coalesceWindowEnd: nextCoalesceWindowEnd(now),
    consolidated: false,
    userId: page.userId,
    workspaceId: page.workspaceId,
    createdAt: nowIso,
    lastUpdated: nowIso,
  });

  await consolidateContentRevisions([...revisions, created], now);
  await enforceRetention(page.id, 'content');
}

/**
 * Opportunistically merges one sealed, aged-out run of `patch` rows (between two baselines) into
 * a single `consolidated` snapshot at the run's last sequence — bounded (touches at most one run
 * per call) so it stays cheap on the hot save path.
 */
async function consolidateContentRevisions(revisions: PageRevision[], now: Date): Promise<void> {
  const run = selectConsolidationRun(
    revisions.map((revision) => ({
      id: revision.id,
      sequence: revision.sequence,
      kind: revision.kind,
      createdAt: revision.createdAt,
    })),
    now
  );
  if (!run) {
    return;
  }

  const repo = await getPageRevisionRepository();
  const content = reconstructAt(
    revisions.map((revision) => toContentRevisionLike(revision)),
    run.endSequence
  );
  const lastInRun = revisions.find((revision) => revision.sequence === run.endSequence)!;

  // Convert the existing row at `run.endSequence` (the last patch in the run — always part of
  // `run.ids`) into the consolidated baseline in place, rather than `create`-ing a second row at
  // the same sequence and deleting the original afterwards. Two rows sharing a `sequence` would
  // otherwise exist simultaneously for the duration of the delete loop below, so an interrupted
  // run (a failed `deleteUsingId`, or the process stopping mid-loop) could leave a genuine
  // duplicate behind — which row `nearestBaseline`/`revisions.at(-1)` then picks is undefined.
  await repo.update({
    ...lastInRun,
    previousSequence: run.previousSequence,
    kind: 'consolidated',
    content,
    patch: '',
    consolidated: true,
    lastUpdated: now.toISOString(),
  });

  for (const id of run.ids) {
    if (id === lastInRun.id) {
      continue;
    }
    await repo.deleteUsingId(id);
  }
}

/**
 * Enforces `MAX_REVISIONS` per `(containerId, target)`. For `content`, prunes by dropping
 * everything below the second-oldest baseline (oldest restore points expire first) — the
 * second-oldest baseline always survives, so reconstruction of any remaining row still finds a
 * preceding baseline. For `values`, simply drops the oldest rows (no baselines to preserve).
 */
async function enforceRetention(containerId: string, target: 'content' | 'values'): Promise<void> {
  const repo = await getPageRevisionRepository();
  const revisions = await loadRevisions(containerId, target);
  if (revisions.length <= MAX_REVISIONS) {
    return;
  }

  if (target === 'values') {
    const excess = revisions.length - MAX_REVISIONS;
    for (const revision of revisions.slice(0, excess)) {
      await repo.deleteUsingId(revision.id);
    }
    return;
  }

  const baselines = revisions
    .filter((revision) => revision.kind !== 'patch')
    .toSorted((a, b) => a.sequence - b.sequence);
  if (baselines.length < 2) {
    return;
  }
  const secondOldestBaselineSequence = baselines[1]!.sequence;
  for (const revision of revisions) {
    if (revision.sequence < secondOldestBaselineSequence) {
      await repo.deleteUsingId(revision.id);
    }
  }
}

type RecordValuesRevisionInput = {
  page: PageContainer;
  changed: Record<string, PageValue | null>;
  author: string;
};

/**
 * Records a values change as a reverse-delta: one appended `target: 'values'` row storing only
 * the changed columns mapped to their *prior* value (or `null` if previously unset). Forms its
 * own gap-free sequence stream, independent of the content stream.
 */
export async function recordValuesRevision({ page, changed, author }: RecordValuesRevisionInput): Promise<void> {
  const repo = await getPageRevisionRepository();
  const now = new Date().toISOString();

  const revisions = await loadRevisions(page.id, 'values');
  const head = revisions.at(-1);

  const valuesBefore: Record<string, PageValue | null> = {};
  for (const columnId of Object.keys(changed)) {
    valuesBefore[columnId] = page.values?.[columnId] ?? null;
  }

  await repo.create({
    containerId: page.id,
    sequence: head ? head.sequence + 1 : 1,
    previousSequence: head ? head.sequence : null,
    kind: 'patch',
    target: 'values',
    content: '',
    patch: '',
    valuesBefore: JSON.stringify(valuesBefore),
    author,
    charsAdded: 0,
    charsRemoved: 0,
    coalesceWindowEnd: now,
    consolidated: false,
    userId: page.userId,
    workspaceId: page.workspaceId,
    createdAt: now,
    lastUpdated: now,
  });

  await enforceRetention(page.id, 'values');
}

/** Loads every `target: 'content'` revision for a page, scoped to its owner, oldest first. */
export async function getContentRevisions(containerId: string, userId: string): Promise<PageRevision[]> {
  const repo = await getPageRevisionRepository();
  return repo.getByQuery(
    addUserIdToQuery(repo.createQuery().eq('containerId', containerId).eq('target', 'content'), userId).sort(
      'sequence',
      'asc'
    )
  );
}

/** Loads every `target: 'values'` revision for a page, scoped to its owner, oldest first. */
export async function getValuesRevisions(containerId: string, userId: string): Promise<PageRevision[]> {
  const repo = await getPageRevisionRepository();
  return repo.getByQuery(
    addUserIdToQuery(repo.createQuery().eq('containerId', containerId).eq('target', 'values'), userId).sort(
      'sequence',
      'asc'
    )
  );
}

// Re-exported for consumers that only need the pure baseline lookup (e.g. the history GET
// endpoint deciding whether a given revision id is even reconstructable).

export { nearestBaseline } from './reconstruct';
