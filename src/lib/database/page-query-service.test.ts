import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';

// Point the app's real supersave database at a fresh temp sqlite file *before* anything imports
// `@/lib/environment` or `@/lib/database` (both lazily read `process.env` only on first call,
// see `getEnvironment()`), so this suite runs against an isolated, disposable database rather
// than mocking the repository layer. Mirrors `src/lib/history/revision-service.test.ts`.
const temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-page-query-test-'));
const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
const mutableEnvironment = process.env as Record<string, string | undefined>;
mutableEnvironment['NODE_ENV'] = 'test';
mutableEnvironment['DB'] = `sqlite://${databaseFile}`;
mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
mutableEnvironment['LOG_LEVEL'] = 'error';
mutableEnvironment['SUPERSAVE_SKIP_SYNC'] = 'false';

const { getContainerRepository } = await import('@/lib/database');
const { executePageQuery, assertValidFilterSortRules, OPERATORS_BY_COLUMN_TYPE } = await import('./page-query-service');

import type { Column } from '@/types/schemas/entities/container';
import type { PageContainer } from '@/types/database';
import type { FilterRule, SortRule } from '@/types/schemas/entities/data-view-query';

const containerRepository = await getContainerRepository();

const dataSourceId = 'data-source-1';
const workspaceId = 'workspace-1';

const columns: Column[] = [
  { id: 'title', name: 'Title', type: 'string' },
  { id: 'age', name: 'Age', type: 'number' },
  { id: 'active', name: 'Active', type: 'boolean' },
  {
    id: 'tags',
    name: 'Tags',
    type: 'multi-select',
    options: [
      { id: 'opt-a', label: 'A', color: 'blue' },
      { id: 'opt-b', label: 'B', color: 'red' },
      { id: 'opt-c', label: 'C', color: 'green' },
    ],
  },
];

let counter = 0;
async function createTestPage(values: Record<string, unknown> = {}): Promise<PageContainer> {
  counter += 1;
  const now = new Date(Date.now() + counter).toISOString();
  const pageData = {
    name: `Test page ${counter}`,
    type: 'page' as const,
    parentId: dataSourceId,
    workspaceId,
    userId: 'user-1',
    emoji: null,
    values,
    lastUpdated: now,
    createdAt: now,
    deletedAt: null,
    deletedRootId: null,
  };
  const created = await containerRepository.create(pageData);
  return created as PageContainer;
}

// --- No filters/sorts: returns all pages under parentId, excludes soft-deleted and other parents ---
{
  const alpha = await createTestPage({ title: { type: 'string', value: 'Alpha' } });
  const beta = await createTestPage({ title: { type: 'string', value: 'Beta' } });

  const deleted = await createTestPage({ title: { type: 'string', value: 'Deleted' } });
  await containerRepository.update({ ...deleted, deletedAt: new Date().toISOString(), deletedRootId: deleted.id });

  await containerRepository.create({
    name: 'Other parent page',
    type: 'page' as const,
    parentId: 'other-data-source',
    workspaceId,
    userId: 'user-1',
    emoji: null,
    values: {},
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedRootId: null,
  } as Parameters<typeof containerRepository.create>[0]);

  const result = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [],
    sorts: [],
    limit: 50,
  });

  const ids = result.pages.map((page) => page.id).toSorted();
  assert.deepEqual(ids, [alpha.id, beta.id].toSorted(), 'only returns non-deleted pages under parentId');
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
}

// --- String `contains` filter, case-insensitive ---
{
  const result = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'title', operator: 'contains', value: 'alp' }],
    sorts: [],
    limit: 50,
  });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.values?.['title']?.value, 'Alpha');
}

// --- String `equals` filter, case-insensitive ---
{
  const result = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'title', operator: 'equals', value: 'BETA' }],
    sorts: [],
    limit: 50,
  });
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0]?.values?.['title']?.value, 'Beta');
}

// --- Number filters (gt/gte/lt/lte) ---
{
  const young = await createTestPage({ age: { type: 'number', value: 5 } });
  const old = await createTestPage({ age: { type: 'number', value: 50 } });

  const gtResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'age', operator: 'gt', value: 10 }],
    sorts: [],
    limit: 50,
  });
  assert.ok(gtResult.pages.some((page) => page.id === old.id));
  assert.ok(!gtResult.pages.some((page) => page.id === young.id));

  const lteResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'age', operator: 'lte', value: 5 }],
    sorts: [],
    limit: 50,
  });
  assert.ok(lteResult.pages.some((page) => page.id === young.id));
  assert.ok(!lteResult.pages.some((page) => page.id === old.id));
}

// --- isEmpty / isNotEmpty on a column never set (missing key, not null) ---
{
  const noAge = await createTestPage({ title: { type: 'string', value: 'No age set' } });

  const emptyResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'age', operator: 'isEmpty' }],
    sorts: [],
    limit: 50,
  });
  assert.ok(emptyResult.pages.some((page) => page.id === noAge.id));

  const notEmptyResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'age', operator: 'isNotEmpty' }],
    sorts: [],
    limit: 50,
  });
  assert.ok(!notEmptyResult.pages.some((page) => page.id === noAge.id));
}

// --- multi-select hasAnyOf / hasAllOf / isEmpty (missing key and explicit []) ---
{
  const withA = await createTestPage({ tags: { type: 'multi-select', value: ['opt-a'] } });
  const withAB = await createTestPage({ tags: { type: 'multi-select', value: ['opt-a', 'opt-b'] } });
  const withNone = await createTestPage({ tags: { type: 'multi-select', value: [] } });
  const missingKey = await createTestPage({});

  const anyOfResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'tags', operator: 'hasAnyOf', value: ['opt-a'] }],
    sorts: [],
    limit: 50,
  });
  const anyOfIds = new Set(anyOfResult.pages.map((page) => page.id));
  assert.ok(anyOfIds.has(withA.id) && anyOfIds.has(withAB.id));
  assert.ok(!anyOfIds.has(withNone.id) && !anyOfIds.has(missingKey.id));

  const allOfResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'tags', operator: 'hasAllOf', value: ['opt-a', 'opt-b'] }],
    sorts: [],
    limit: 50,
  });
  const allOfIds = new Set(allOfResult.pages.map((page) => page.id));
  assert.ok(allOfIds.has(withAB.id));
  assert.ok(!allOfIds.has(withA.id));

  const isEmptyResult = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'tags', operator: 'isEmpty' }],
    sorts: [],
    limit: 50,
  });
  const isEmptyIds = new Set(isEmptyResult.pages.map((page) => page.id));
  assert.ok(isEmptyIds.has(withNone.id), 'explicit [] counts as empty');
  assert.ok(isEmptyIds.has(missingKey.id), 'missing key counts as empty too');
  assert.ok(!isEmptyIds.has(withA.id));
}

// --- Sorting ascending/descending by a string column, case-insensitively ---
{
  const parentId = 'sort-data-source';
  const zeta = await createTestPage({ title: { type: 'string', value: 'zeta' } });
  const alpha = await createTestPage({ title: { type: 'string', value: 'Alpha' } });
  const middle = await createTestPage({ title: { type: 'string', value: 'Middle' } });
  await Promise.all([zeta, alpha, middle].map((page) => containerRepository.update({ ...page, parentId })));

  const ascResult = await executePageQuery({
    parentId,
    columns,
    filters: [],
    sorts: [{ columnId: 'title', direction: 'asc' }],
    limit: 50,
  });
  assert.deepEqual(
    ascResult.pages.map((page) => page.values?.['title']?.value),
    ['Alpha', 'Middle', 'zeta']
  );

  const descResult = await executePageQuery({
    parentId,
    columns,
    filters: [],
    sorts: [{ columnId: 'title', direction: 'desc' }],
    limit: 50,
  });
  assert.deepEqual(
    descResult.pages.map((page) => page.values?.['title']?.value),
    ['zeta', 'Middle', 'Alpha']
  );
}

// --- Cursor pagination: limit + cursor walks through the full ordered result set exactly once ---
{
  const parentId = 'cursor-data-source';
  const values = new Set(['Echo', 'Bravo', 'Delta', 'Charlie', 'Alfa']);
  for (const value of values) {
    await createTestPage({ title: { type: 'string', value } });
  }
  for (const page of await containerRepository.getByQuery(containerRepository.createQuery().eq('type', 'page'))) {
    if (page.type === 'page' && page.values?.['title'] && values.has(page.values['title'].value as string)) {
      await containerRepository.update({ ...page, parentId });
    }
  }

  const seen: string[] = [];
  let cursor: Awaited<ReturnType<typeof executePageQuery>>['nextCursor'] = undefined as unknown as null;
  let iterations = 0;
  do {
    const result: Awaited<ReturnType<typeof executePageQuery>> = await executePageQuery({
      parentId,
      columns,
      filters: [],
      sorts: [{ columnId: 'title', direction: 'asc' }],
      limit: 2,
      ...(cursor ? { cursor } : {}),
    });
    for (const page of result.pages) {
      seen.push(page.values?.['title']?.value as string);
    }
    cursor = result.nextCursor;
    iterations += 1;
  } while (cursor && iterations < 10);

  assert.deepEqual(seen, ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo']);
  assert.equal(new Set(seen).size, 5, 'no duplicates/skips across pages');
}

// --- Stale rules (deleted/renamed column) are silently dropped rather than erroring ---
{
  const result = await executePageQuery({
    parentId: dataSourceId,
    columns,
    filters: [{ columnId: 'no-such-column', operator: 'equals', value: 'x' } as FilterRule],
    sorts: [{ columnId: 'no-such-column', direction: 'asc' } as SortRule],
    limit: 50,
  });
  assert.ok(Array.isArray(result.pages));
}

// --- assertValidFilterSortRules: throws for unknown columnId / invalid operator-for-type ---
{
  assert.throws(() => assertValidFilterSortRules(columns, [{ columnId: 'nope', operator: 'equals', value: 'x' }], []));
  assert.throws(() => assertValidFilterSortRules(columns, [{ columnId: 'age', operator: 'contains', value: 'x' }], []));
  assert.doesNotThrow(() =>
    assertValidFilterSortRules(
      columns,
      [{ columnId: 'age', operator: 'gt', value: 1 }],
      [{ columnId: 'title', direction: 'asc' }]
    )
  );
}

// --- OPERATORS_BY_COLUMN_TYPE covers every column type with at least one operator ---
{
  for (const type of ['string', 'number', 'boolean', 'date', 'single-select', 'multi-select'] as const) {
    assert.ok(OPERATORS_BY_COLUMN_TYPE[type].length > 0, `${type} should have operators defined`);
  }
}

await rm(temporaryDirectory, { recursive: true, force: true });

console.log('page-query-service.test.ts: all assertions passed');
