import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import { createTestDatabaseFile } from '../../../tests/helpers/create-test-database';

import type { PageContainer } from '@thoth/database/types';

const stringValue = (value: string) => ({ type: 'string' as const, value });

describe('revision-service', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<(typeof import('@/lib/database'))['getContainerRepository']>>;
  let recordContentRevision: (typeof import('./revision-service'))['recordContentRevision'];
  let recordValuesRevision: (typeof import('./revision-service'))['recordValuesRevision'];
  let getContentRevisions: (typeof import('./revision-service'))['getContentRevisions'];
  let getValuesRevisions: (typeof import('./revision-service'))['getValuesRevisions'];
  let buildContentFields: (typeof import('./revision-service'))['buildContentFields'];
  let reconstructAt: (typeof import('./reconstruct'))['reconstructAt'];
  let SNAPSHOT_INTERVAL: (typeof import('./constants'))['SNAPSHOT_INTERVAL'];
  let MAX_PATCH_BYTES: (typeof import('./constants'))['MAX_PATCH_BYTES'];

  beforeAll(async () => {
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    mutableEnvironment['NODE_ENV'] = 'test';
    mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
    mutableEnvironment['LOG_LEVEL'] = 'error';

    const { temporaryDirectory: createdDirectory, databaseUrl } =
      await createTestDatabaseFile('thoth-page-revision-test-');
    temporaryDirectory = createdDirectory;
    mutableEnvironment['DB'] = databaseUrl;

    const databaseModule = await import('@/lib/database');
    const revisionServiceModule = await import('./revision-service');
    const reconstructModule = await import('./reconstruct');
    const constantsModule = await import('./constants');

    containerRepository = await databaseModule.getContainerRepository();
    recordContentRevision = revisionServiceModule.recordContentRevision;
    recordValuesRevision = revisionServiceModule.recordValuesRevision;
    getContentRevisions = revisionServiceModule.getContentRevisions;
    getValuesRevisions = revisionServiceModule.getValuesRevisions;
    buildContentFields = revisionServiceModule.buildContentFields;
    reconstructAt = reconstructModule.reconstructAt;
    SNAPSHOT_INTERVAL = constantsModule.SNAPSHOT_INTERVAL;
    MAX_PATCH_BYTES = constantsModule.MAX_PATCH_BYTES;
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

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

  test('writes a lazy baseline on first save, then coalesces same-author edits and appends different authors', async () => {
    const page = await createTestPage('initial content');
    await recordContentRevision({ page, newContent: 'first edit', author: 'user-1' });

    const revisions = await getContentRevisions(page.id, 'user-1');
    expect(revisions.length).toBe(2);
    expect(revisions[0]!.sequence).toBe(1);
    expect(revisions[0]!.kind).toBe('snapshot');
    expect(revisions[0]!.content).toBe('initial content');
    expect(revisions[1]!.sequence).toBe(2);
    expect(reconstructAt(toContentLike(revisions), 2)).toBe('first edit');

    await recordContentRevision({ page, newContent: 'first edit, refined', author: 'user-1' });
    const afterCoalesce = await getContentRevisions(page.id, 'user-1');
    expect(afterCoalesce.length).toBe(2);
    expect(reconstructAt(toContentLike(afterCoalesce), 2)).toBe('first edit, refined');

    await recordContentRevision({ page, newContent: 'second edit by someone else', author: 'user-2' });
    const afterAppend = await getContentRevisions(page.id, 'user-1');
    expect(afterAppend.length).toBe(3);
    expect(afterAppend[2]!.sequence).toBe(3);
    expect(afterAppend[2]!.previousSequence).toBe(2);
    expect(reconstructAt(toContentLike(afterAppend), 3)).toBe('second edit by someone else');
  });

  test('stores a full snapshot every SNAPSHOT_INTERVAL revisions', async () => {
    const page = await createTestPage('');
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
    expect(atInterval).toBeTruthy();
    expect(atInterval!.kind).toBe('snapshot');
  });

  test('downgrades oversized patches to snapshots and honors forced snapshots', () => {
    const base = 'a'.repeat(900_000);
    const totallyDifferent = Array.from({ length: 900_000 }, (_, index) =>
      String.fromCodePoint(19_968 + (index % 500))
    ).join('');
    const fields = buildContentFields(base, totallyDifferent, false);
    expect(fields.kind).toBe('snapshot');
    expect(fields.content).toBe(totallyDifferent);
    expect(fields.patch).toBe('');

    const forced = buildContentFields('a', 'b', true);
    expect(forced.kind).toBe('snapshot');
    expect(MAX_PATCH_BYTES > 0).toBeTruthy();
  });

  test('writes correct valuesBefore entries with an independent values sequence', async () => {
    const page = await createTestPage('some content');
    await recordContentRevision({ page, newContent: 'edited content', author: 'user-1' });

    await recordValuesRevision({ page, changed: { title: stringValue('first title') }, author: 'user-1' });
    const pageWithFirstValue = { ...page, values: { title: stringValue('first title') } };
    await recordValuesRevision({
      page: pageWithFirstValue,
      changed: { title: stringValue('second title') },
      author: 'user-1',
    });

    const valuesRevisions = await getValuesRevisions(page.id, 'user-1');
    expect(valuesRevisions.length).toBe(2);
    expect(valuesRevisions[0]!.sequence).toBe(1);
    expect(valuesRevisions[0]!.previousSequence).toBeNull();
    expect(JSON.parse(valuesRevisions[0]!.valuesBefore)).toEqual({ title: null });
    expect(valuesRevisions[1]!.sequence).toBe(2);
    expect(valuesRevisions[1]!.previousSequence).toBe(1);
    expect(JSON.parse(valuesRevisions[1]!.valuesBefore)).toEqual({ title: stringValue('first title') });

    const contentRevisions = await getContentRevisions(page.id, 'user-1');
    expect(contentRevisions.length).toBe(2);
  });
});
