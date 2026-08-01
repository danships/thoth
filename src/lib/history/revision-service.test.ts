import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';

// Point the app's real supersave database at a fresh temp sqlite file *before* anything imports
// `@/lib/environment` or `@/lib/database` (both lazily read `process.env` only on first call,
// see `getEnvironment()`), so this suite runs against an isolated, disposable database rather
// than mocking the repository layer.
const temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-page-revision-test-'));
const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
const mutableEnvironment = process.env as Record<string, string | undefined>;
mutableEnvironment['NODE_ENV'] = 'test';
mutableEnvironment['DB'] = `sqlite://${databaseFile}`;
mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
mutableEnvironment['LOG_LEVEL'] = 'error';
mutableEnvironment['SUPERSAVE_SKIP_SYNC'] = 'false';

const { getContainerRepository } = await import('@/lib/database');
const { recordContentRevision, recordValuesRevision, getContentRevisions, getValuesRevisions, buildContentFields } =
  await import('./revision-service');
const { reconstructAt } = await import('./reconstruct');
const { SNAPSHOT_INTERVAL, MAX_PATCH_BYTES } = await import('./constants');

import type { PageContainer } from '@/types/database';

const containerRepository = await getContainerRepository();

async function createTestPage(initialContent: string): Promise<PageContainer> {
  const pageData = {
    name: 'Test page',
    type: 'page' as const,
    parentId: null,
    workspaceId: 'workspace-1',
    userId: 'user-1',
    emoji: null,
    content: initialContent,
    values: {},
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedRootId: null,
  };
  const created = await containerRepository.create(pageData);
  return created as PageContainer;
}

function toContentLike(revisions: Awaited<ReturnType<typeof getContentRevisions>>) {
  return revisions.map((revision) => ({
    sequence: revision.sequence,
    kind: revision.kind,
    content: revision.content,
    patch: revision.patch,
  }));
}

// --- First-save lazy baseline: seq 1 snapshot of prior content, seq 2 new content ---
{
  const page = await createTestPage('initial content');
  await recordContentRevision({ page, newContent: 'first edit', author: 'user-1' });

  const revisions = await getContentRevisions(page.id, 'user-1');
  assert.equal(revisions.length, 2);
  assert.equal(revisions[0]!.sequence, 1);
  assert.equal(revisions[0]!.kind, 'snapshot');
  assert.equal(revisions[0]!.content, 'initial content');
  assert.equal(revisions[1]!.sequence, 2);
  assert.equal(reconstructAt(toContentLike(revisions), 2), 'first edit');

  // --- Coalesce updates head in place within window (same author, still-open window) ---
  await recordContentRevision({ page, newContent: 'first edit, refined', author: 'user-1' });
  const afterCoalesce = await getContentRevisions(page.id, 'user-1');
  assert.equal(afterCoalesce.length, 2, 'same-author save within the coalesce window should not append');
  assert.equal(reconstructAt(toContentLike(afterCoalesce), 2), 'first edit, refined');

  // --- A different author always appends, never coalesces ---
  await recordContentRevision({ page, newContent: 'second edit by someone else', author: 'user-2' });
  const afterAppend = await getContentRevisions(page.id, 'user-1');
  assert.equal(afterAppend.length, 3);
  assert.equal(afterAppend[2]!.sequence, 3);
  assert.equal(afterAppend[2]!.previousSequence, 2);
  assert.equal(reconstructAt(toContentLike(afterAppend), 3), 'second edit by someone else');
}

// --- Interval snapshot every SNAPSHOT_INTERVAL revisions ---
{
  const page = await createTestPage('');
  // Alternate authors on every save so every call appends (never coalesces), reaching exactly
  // `SNAPSHOT_INTERVAL` appended+lazy-baseline revisions.
  let sequenceCount = 0;
  let authorToggle = 0;
  while (sequenceCount < SNAPSHOT_INTERVAL) {
    authorToggle += 1;
    await recordContentRevision({
      page,
      newContent: `content v${authorToggle}`,
      author: `user-${authorToggle}`,
    });
    const currentRevisions = await getContentRevisions(page.id, 'user-1');
    sequenceCount = currentRevisions.length;
  }

  const revisions = await getContentRevisions(page.id, 'user-1');
  const atInterval = revisions.find((revision) => revision.sequence === SNAPSHOT_INTERVAL);
  assert.ok(atInterval, `expected a revision at sequence ${SNAPSHOT_INTERVAL}`);
  assert.equal(atInterval!.kind, 'snapshot', 'every SNAPSHOT_INTERVAL-th revision should be a full snapshot');
}

// --- Oversized-patch downgrade to snapshot ---
{
  // Two large, entirely unrelated strings produce a patch whose escaped (`encodeURI`-based)
  // text representation exceeds MAX_PATCH_BYTES, so it must be stored as a snapshot instead.
  const base = 'a'.repeat(900_000);
  const totallyDifferent = Array.from({ length: 900_000 }, (_, index) =>
    String.fromCodePoint(19_968 + (index % 500))
  ).join('');
  const fields = buildContentFields(base, totallyDifferent, false);
  assert.equal(fields.kind, 'snapshot');
  assert.equal(fields.content, totallyDifferent);
  assert.equal(fields.patch, '');

  // Sanity: a forced snapshot always downgrades regardless of size.
  const forced = buildContentFields('a', 'b', true);
  assert.equal(forced.kind, 'snapshot');

  // Sanity: MAX_PATCH_BYTES is a real, positive bound.
  assert.ok(MAX_PATCH_BYTES > 0);
}

// --- recordValuesRevision writes correct valuesBefore and independent per-target sequence ---
{
  const page = await createTestPage('some content');
  await recordContentRevision({ page, newContent: 'edited content', author: 'user-1' });

  const stringValue = (value: string) => ({ type: 'string' as const, value });

  await recordValuesRevision({ page, changed: { title: stringValue('first title') }, author: 'user-1' });
  const pageWithFirstValue = { ...page, values: { title: stringValue('first title') } };
  await recordValuesRevision({
    page: pageWithFirstValue,
    changed: { title: stringValue('second title') },
    author: 'user-1',
  });

  const valuesRevisions = await getValuesRevisions(page.id, 'user-1');
  assert.equal(valuesRevisions.length, 2);
  assert.equal(valuesRevisions[0]!.sequence, 1);
  assert.equal(valuesRevisions[0]!.previousSequence, null);
  assert.deepEqual(JSON.parse(valuesRevisions[0]!.valuesBefore), { title: null });
  assert.equal(valuesRevisions[1]!.sequence, 2);
  assert.equal(valuesRevisions[1]!.previousSequence, 1);
  assert.deepEqual(JSON.parse(valuesRevisions[1]!.valuesBefore), { title: stringValue('first title') });

  // The values stream's sequence numbering is independent of (does not interleave with) the
  // content stream's, which by now is already at sequence 2 for this page.
  const contentRevisions = await getContentRevisions(page.id, 'user-1');
  assert.equal(contentRevisions.length, 2);
}

await rm(temporaryDirectory, { recursive: true, force: true });

console.log('✅  revision-service tests passed');
