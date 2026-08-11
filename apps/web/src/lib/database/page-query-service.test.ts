import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import { createTestDatabaseFile } from '../../../tests/helpers/create-test-database';

import type { Column } from '@/types/schemas/entities/container';
import type { PageContainer } from '@/types/database';
import { NAME_SORT_COLUMN_ID } from '@/types/schemas/entities/data-view-query';
import type { FilterRule, SortRule } from '@/types/schemas/entities/data-view-query';

describe('page-query-service', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<(typeof import('@/lib/database'))['getContainerRepository']>>;
  let executePageQuery: (typeof import('./page-query-service'))['executePageQuery'];
  let assertValidFilterSortRules: (typeof import('./page-query-service'))['assertValidFilterSortRules'];
  let OPERATORS_BY_COLUMN_TYPE: (typeof import('./page-query-service'))['OPERATORS_BY_COLUMN_TYPE'];

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

  beforeAll(async () => {
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    mutableEnvironment['NODE_ENV'] = 'test';
    mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
    mutableEnvironment['LOG_LEVEL'] = 'error';

    const { temporaryDirectory: createdDirectory, databaseUrl } =
      await createTestDatabaseFile('thoth-page-query-test-');
    temporaryDirectory = createdDirectory;
    mutableEnvironment['DB'] = databaseUrl;

    const databaseModule = await import('@/lib/database');
    const pageQueryServiceModule = await import('./page-query-service');

    containerRepository = await databaseModule.getContainerRepository();
    executePageQuery = pageQueryServiceModule.executePageQuery;
    assertValidFilterSortRules = pageQueryServiceModule.assertValidFilterSortRules;
    OPERATORS_BY_COLUMN_TYPE = pageQueryServiceModule.OPERATORS_BY_COLUMN_TYPE;
    counter = 0;
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

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

  test('returns all pages under parentId without filters or sorts', async () => {
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
    expect(ids).toEqual([alpha.id, beta.id].toSorted());
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test('filters string contains case-insensitively', async () => {
    const result = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'title', operator: 'contains', value: 'alp' }],
      sorts: [],
      limit: 50,
    });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0]?.values?.['title']?.value).toBe('Alpha');
  });

  test('filters string equals case-insensitively', async () => {
    const result = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'title', operator: 'equals', value: 'BETA' }],
      sorts: [],
      limit: 50,
    });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0]?.values?.['title']?.value).toBe('Beta');
  });

  test('applies number gt and lte filters', async () => {
    const young = await createTestPage({ age: { type: 'number', value: 5 } });
    const old = await createTestPage({ age: { type: 'number', value: 50 } });

    const gtResult = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'age', operator: 'gt', value: 10 }],
      sorts: [],
      limit: 50,
    });
    expect(gtResult.pages.some((page) => page.id === old.id)).toBeTruthy();
    expect(!gtResult.pages.some((page) => page.id === young.id)).toBeTruthy();

    const lteResult = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'age', operator: 'lte', value: 5 }],
      sorts: [],
      limit: 50,
    });
    expect(lteResult.pages.some((page) => page.id === young.id)).toBeTruthy();
    expect(!lteResult.pages.some((page) => page.id === old.id)).toBeTruthy();
  });

  test('treats a never-set column as empty but not non-empty', async () => {
    const noAge = await createTestPage({ title: { type: 'string', value: 'No age set' } });

    const emptyResult = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'age', operator: 'isEmpty' }],
      sorts: [],
      limit: 50,
    });
    expect(emptyResult.pages.some((page) => page.id === noAge.id)).toBeTruthy();

    const notEmptyResult = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'age', operator: 'isNotEmpty' }],
      sorts: [],
      limit: 50,
    });
    expect(!notEmptyResult.pages.some((page) => page.id === noAge.id)).toBeTruthy();
  });

  test('supports multi-select hasAnyOf, hasAllOf, and isEmpty', async () => {
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
    expect(anyOfIds.has(withA.id) && anyOfIds.has(withAB.id)).toBeTruthy();
    expect(!anyOfIds.has(withNone.id) && !anyOfIds.has(missingKey.id)).toBeTruthy();

    const allOfResult = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'tags', operator: 'hasAllOf', value: ['opt-a', 'opt-b'] }],
      sorts: [],
      limit: 50,
    });
    const allOfIds = new Set(allOfResult.pages.map((page) => page.id));
    expect(allOfIds.has(withAB.id)).toBeTruthy();
    expect(!allOfIds.has(withA.id)).toBeTruthy();

    const isEmptyResult = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'tags', operator: 'isEmpty' }],
      sorts: [],
      limit: 50,
    });
    const isEmptyIds = new Set(isEmptyResult.pages.map((page) => page.id));
    expect(isEmptyIds.has(withNone.id)).toBeTruthy();
    expect(isEmptyIds.has(missingKey.id)).toBeTruthy();
    expect(!isEmptyIds.has(withA.id)).toBeTruthy();
  });

  test('sorts ascending and descending by a string column case-insensitively', async () => {
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
    expect(ascResult.pages.map((page) => page.values?.['title']?.value)).toEqual(['Alpha', 'Middle', 'zeta']);

    const descResult = await executePageQuery({
      parentId,
      columns,
      filters: [],
      sorts: [{ columnId: 'title', direction: 'desc' }],
      limit: 50,
    });
    expect(descResult.pages.map((page) => page.values?.['title']?.value)).toEqual(['zeta', 'Middle', 'Alpha']);
  });

  test('sorts ascending and descending by the built-in name attribute case-insensitively (THOTH-065)', async () => {
    const parentId = 'name-sort-data-source';
    const zeta = await createTestPage();
    await containerRepository.update({ ...zeta, name: 'zeta', parentId });
    const alpha = await createTestPage();
    await containerRepository.update({ ...alpha, name: 'Alpha', parentId });
    const middle = await createTestPage();
    await containerRepository.update({ ...middle, name: 'Middle', parentId });

    const ascResult = await executePageQuery({
      parentId,
      columns,
      filters: [],
      sorts: [{ columnId: NAME_SORT_COLUMN_ID, direction: 'asc' }],
      limit: 50,
    });
    expect(ascResult.pages.map((page) => page.name)).toEqual(['Alpha', 'Middle', 'zeta']);

    const descResult = await executePageQuery({
      parentId,
      columns,
      filters: [],
      sorts: [{ columnId: NAME_SORT_COLUMN_ID, direction: 'desc' }],
      limit: 50,
    });
    expect(descResult.pages.map((page) => page.name)).toEqual(['zeta', 'Middle', 'Alpha']);
  });

  test('accepts the "name" sentinel sort columnId even when it is not a data source column', () => {
    expect(() =>
      assertValidFilterSortRules(columns, [], [{ columnId: NAME_SORT_COLUMN_ID, direction: 'asc' }])
    ).not.toThrow();
  });

  test('walks cursor pagination without duplicates or skips', async () => {
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

    expect(seen).toEqual(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo']);
    expect(new Set(seen).size).toBe(5);
  });

  test('walks desc cursor pagination without duplicates or skips', async () => {
    const parentId = 'desc-cursor-data-source';
    const values = ['Echo', 'Bravo', 'Delta', 'Charlie', 'Alfa'];
    for (const value of values) {
      const page = await createTestPage({ title: { type: 'string', value } });
      await containerRepository.update({ ...page, parentId });
    }

    const seen: string[] = [];
    let cursor: Awaited<ReturnType<typeof executePageQuery>>['nextCursor'] = undefined as unknown as null;
    let iterations = 0;
    do {
      const result = await executePageQuery({
        parentId,
        columns,
        filters: [],
        sorts: [{ columnId: 'title', direction: 'desc' }],
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      for (const page of result.pages) {
        seen.push(page.values?.['title']?.value as string);
      }
      cursor = result.nextCursor;
      iterations += 1;
    } while (cursor && iterations < 10);

    expect(seen).toEqual(['Echo', 'Delta', 'Charlie', 'Bravo', 'Alfa']);
    expect(new Set(seen).size).toBe(5);
  });

  test('walks multi-sort cursor pagination (boolean asc + number desc)', async () => {
    const parentId = 'multi-sort-cursor-ds';
    const rows = [
      { title: 'T1', active: true, age: 10 },
      { title: 'T2', active: false, age: 30 },
      { title: 'T3', active: true, age: 20 },
      { title: 'T4', active: false, age: 5 },
    ];
    for (const row of rows) {
      const page = await createTestPage({
        title: { type: 'string', value: row.title },
        active: { type: 'boolean', value: row.active },
        age: { type: 'number', value: row.age },
      });
      await containerRepository.update({ ...page, parentId });
    }

    const seen: string[] = [];
    let cursor: Awaited<ReturnType<typeof executePageQuery>>['nextCursor'] = undefined as unknown as null;
    let iterations = 0;
    do {
      const result = await executePageQuery({
        parentId,
        columns,
        filters: [],
        sorts: [
          { columnId: 'active', direction: 'asc' },
          { columnId: 'age', direction: 'desc' },
        ],
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      for (const page of result.pages) {
        seen.push(page.values?.['title']?.value as string);
      }
      cursor = result.nextCursor;
      iterations += 1;
    } while (cursor && iterations < 10);

    // active asc: false (0) before true (1)
    // Within false: age desc: T2(30), T4(5)
    // Within true: age desc: T3(20), T1(10)
    expect(seen).toEqual(['T2', 'T4', 'T3', 'T1']);
  });

  test('silently drops stale deleted or renamed rules instead of erroring', async () => {
    const result = await executePageQuery({
      parentId: dataSourceId,
      columns,
      filters: [{ columnId: 'no-such-column', operator: 'equals', value: 'x' } as FilterRule],
      sorts: [{ columnId: 'no-such-column', direction: 'asc' } as SortRule],
      limit: 50,
    });
    expect(Array.isArray(result.pages)).toBeTruthy();
  });

  test('throws for unknown column ids or invalid operators and accepts valid rules', () => {
    expect(() =>
      assertValidFilterSortRules(columns, [{ columnId: 'nope', operator: 'equals', value: 'x' }], [])
    ).toThrow();
    expect(() =>
      assertValidFilterSortRules(columns, [{ columnId: 'age', operator: 'contains', value: 'x' }], [])
    ).toThrow();
    expect(() =>
      assertValidFilterSortRules(
        columns,
        [{ columnId: 'age', operator: 'gt', value: 1 }],
        [{ columnId: 'title', direction: 'asc' }]
      )
    ).not.toThrow();
  });

  test('defines at least one operator for every supported column type', () => {
    for (const type of ['string', 'number', 'boolean', 'date', 'single-select', 'multi-select'] as const) {
      expect(OPERATORS_BY_COLUMN_TYPE[type].length > 0).toBeTruthy();
    }
  });
});
