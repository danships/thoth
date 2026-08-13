import { getPageRevisionRepository } from '../repositories.js';
import { addUserIdToQuery } from '../helpers.js';
import type { PageContainer } from '../types.js';
import type { PageValue } from '../schemas/entities/container.js';
import type { PageRevision } from '../types.js';
import { makePatch, summarise } from './delta.js';
import { reconstructAt, type ContentRevisionLike } from './reconstruct.js';
import { nextCoalesceWindowEnd, shouldCoalesce } from './coalesce.js';
import { MAX_PATCH_BYTES, SNAPSHOT_INTERVAL } from './constants.js';

/**
 * Records immediate revision state for page saves (THOTH-058/THOTH-062). Consolidation
 * (`selectConsolidationRun`/`selectAllConsolidationRuns`) and retention (`MAX_REVISIONS`
 * enforcement) are deliberately NOT performed here — they moved to the scheduled
 * `history.maintain` job (`./maintenance.ts`) so a page save never pays for background
 * housekeeping. Everything that must be immediately visible in the history timeline — the
 * lazy first-save baseline, same-author coalescing, patch/snapshot selection, summary counts,
 * and values reverse-deltas — remains synchronous here.
 */
export async function loadRevisions(containerId: string, target: 'content' | 'values'): Promise<PageRevision[]> {
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
 * baseline snapshot. Consolidation/retention are handled asynchronously by scheduled
 * maintenance (`./maintenance.ts`), never here.
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

  await repo.create({
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
}

type RecordValuesRevisionInput = {
  page: PageContainer;
  changed: Record<string, PageValue | null>;
  author: string;
};

/**
 * Records a values change as a reverse-delta: one appended `target: 'values'` row storing only
 * the changed columns mapped to their *prior* value (or `null` if previously unset). Forms its
 * own gap-free sequence stream, independent of the content stream. Retention is enforced only by
 * scheduled maintenance (`./maintenance.ts`), never on this hot path.
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
export { nearestBaseline } from './reconstruct.js';
