import { describe, test, expect, afterEach } from 'vitest';
import { getBaseUrl, getOwnerClient, getData, SEED, createAnonymousClient } from '../../support/fixtures';
import type { ApiClient } from '../../support/fixtures';

// ── Helpers ─────────────────────────────────────────────────────────────────

const fs = SEED.filterSort;
const cols = fs.dataSource.columns;
const LABEL = cols[0].id;
const SCORE = cols[1].id;
const ACTIVE = cols[2].id;
const DUE = cols[3].id;
const PRIORITY = cols[4].id;
const TAGS = cols[5].id;

const VIEW_ID = fs.dataView.id;

type PageEntry = {
  page: { id: string; name: string };
  values?: Record<string, { type: string; value: unknown }>;
};

type PaginatedResponse = {
  data: PageEntry[];
  pagination: { nextCursor: string | null; hasMore: boolean };
};

async function queryView(
  client: ApiClient,
  options: {
    filters?: unknown[];
    sorts?: unknown[];
    includeValues?: boolean;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<PaginatedResponse> {
  const includeValues = options.includeValues ?? true;
  const params: Record<string, string> = {
    viewId: VIEW_ID,
    // z.coerce.boolean() coerces any non-empty string (including "false") to true;
    // only send the parameter when its value is truthy, and omit it to get the default (false).
    ...(includeValues ? { includeValues: 'true' } : {}),
  };
  if (options.filters) params['filters'] = JSON.stringify(options.filters);
  if (options.sorts) params['sorts'] = JSON.stringify(options.sorts);
  if (options.cursor) params['cursor'] = options.cursor;
  if (options.limit) params['limit'] = String(options.limit);

  const response = await client.get('/api/v1/pages', { params });
  expect(response.status, `GET /pages returned ${response.status}`).toBe(200);
  return response.json<PaginatedResponse>();
}

function pageIds(result: PaginatedResponse): string[] {
  return result.data.map((entry) => entry.page.id);
}

function rowId(letter: string): string {
  const row = fs.rows.find((r) => r.name.toLowerCase().startsWith(letter));
  if (!row) throw new Error(`No row starting with '${letter}'`);
  return row.id;
}

// Row IDs by first letter for convenience
const A = rowId('a'); // Apple
const B = rowId('b'); // Banana
const C = rowId('c'); // cherry
const D = rowId('d'); // Date
const E = rowId('e'); // elderberry
const F = rowId('f'); // Fig
const G = rowId('g'); // grape
const H = rowId('h'); // Honeydew

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Data View filter/sort API', () => {
  afterEach(async () => {
    // Reset the view to no filters/sorts after each test
    const client = await getOwnerClient(getBaseUrl());
    await client.patch(`/api/v1/views/${VIEW_ID}`, { filters: [], sorts: [] });
  });

  // ── String filtering ────────────────────────────────────────────────────

  describe('string column filters', () => {
    test('contains filter is case-insensitive', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: LABEL, operator: 'contains', value: 'an' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(B); // "Banana Item" contains "an"
      expect(ids).not.toContain(A);
    });

    test('equals filter is case-insensitive', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: LABEL, operator: 'equals', value: 'APPLE ITEM' }],
      });
      expect(pageIds(result)).toEqual([A]);
    });

    test('notEquals filter excludes the matching row', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: LABEL, operator: 'notEquals', value: 'Apple Item' }],
      });
      const ids = pageIds(result);
      expect(ids).not.toContain(A);
      expect(ids.length).toBeGreaterThan(0);
    });

    test('notContains filter', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: LABEL, operator: 'notContains', value: 'Item' }],
      });
      // All rows have 'Item' in their Label value, so nothing should match
      // except rows without a Label value (Honeydew has Label='Honeydew Item', Date has 'Date Item')
      // Actually all rows have Label set to `${name} Item`
      expect(pageIds(result)).toHaveLength(0);
    });

    test('isEmpty returns rows with missing string values', async () => {
      const client = await getOwnerClient(getBaseUrl());
      // All rows have a Label, so isEmpty on Label should return nothing
      const result = await queryView(client, {
        filters: [{ columnId: LABEL, operator: 'isEmpty' }],
      });
      expect(pageIds(result)).toHaveLength(0);
    });

    test('isNotEmpty returns all rows that have a string value set', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: LABEL, operator: 'isNotEmpty' }],
      });
      // All 8 rows have Label set
      expect(pageIds(result)).toHaveLength(8);
    });
  });

  // ── Number filtering ────────────────────────────────────────────────────

  describe('number column filters', () => {
    test('gt filter returns rows above the threshold', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'gt', value: 15 }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(B); // 30
      expect(ids).toContain(C); // 20
      expect(ids).not.toContain(A); // 10
      expect(ids).not.toContain(D); // null
    });

    test('gte filter includes the boundary', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'gte', value: 10 }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // 10
      expect(ids).toContain(E); // 10
      expect(ids).toContain(B); // 30
      expect(ids).toContain(C); // 20
      expect(ids).not.toContain(F); // 0
      expect(ids).not.toContain(G); // -5
    });

    test('lt filter returns rows below the threshold', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'lt', value: 10 }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(F); // 0
      expect(ids).toContain(G); // -5
      expect(ids).not.toContain(A); // 10
    });

    test('lte filter includes the boundary', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'lte', value: 0 }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(F); // 0
      expect(ids).toContain(G); // -5
      expect(ids).not.toContain(A); // 10
    });

    test('equals on number', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'equals', value: 10 }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // 10
      expect(ids).toContain(E); // 10
      expect(ids).not.toContain(B); // 30
    });

    test('isEmpty returns rows with null Score', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'isEmpty' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(D); // null
      expect(ids).toContain(H); // null
      expect(ids).not.toContain(A); // 10
      expect(ids).not.toContain(F); // 0 is NOT empty
    });

    test('isNotEmpty excludes null Score rows', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'isNotEmpty' }],
      });
      const ids = pageIds(result);
      expect(ids).not.toContain(D);
      expect(ids).not.toContain(H);
      expect(ids).toContain(F); // 0 is not empty
    });
  });

  // ── Boolean filtering ───────────────────────────────────────────────────

  describe('boolean column filters', () => {
    test('equals true returns only true rows', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: ACTIVE, operator: 'equals', value: true }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // true
      expect(ids).toContain(C); // true
      expect(ids).toContain(F); // true
      expect(ids).not.toContain(B); // false
      expect(ids).not.toContain(D); // null
    });

    test('equals false returns only false rows', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: ACTIVE, operator: 'equals', value: false }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(B); // false
      expect(ids).toContain(E); // false
      expect(ids).toContain(G); // false
      expect(ids).not.toContain(A); // true
    });

    test('notEquals true returns false and null rows', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: ACTIVE, operator: 'notEquals', value: true }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(B); // false
      expect(ids).not.toContain(A); // true
    });
  });

  // ── Date filtering ──────────────────────────────────────────────────────

  describe('date column filters', () => {
    test('equals on date returns rows with that exact date', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: DUE, operator: 'equals', value: '2025-06-15' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // 2025-06-15
      expect(ids).toContain(C); // 2025-06-15
      expect(ids).toContain(G); // 2025-06-15
      expect(ids).not.toContain(B); // 2025-03-01
    });

    test('gt on date returns rows after the boundary', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: DUE, operator: 'gt', value: '2025-06-15' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(F); // 2025-12-31
      expect(ids).not.toContain(A); // 2025-06-15 (not strictly gt)
    });

    test('isEmpty on date returns rows with null/missing date', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: DUE, operator: 'isEmpty' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(D);
      expect(ids).toContain(H);
      expect(ids).not.toContain(A);
    });
  });

  // ── Single-select filtering ─────────────────────────────────────────────

  describe('single-select column filters', () => {
    test('equals on single-select matches by option ID', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const highId = fs.dataSource.columns[4].options[2].id;
      const result = await queryView(client, {
        filters: [{ columnId: PRIORITY, operator: 'equals', value: highId }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // High
      expect(ids).toContain(E); // High
      expect(ids).not.toContain(B); // Low
    });

    test('isEmpty on single-select returns rows with no priority set', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: PRIORITY, operator: 'isEmpty' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(D);
      expect(ids).toContain(G);
      expect(ids).toContain(H);
      expect(ids).not.toContain(A); // High
    });
  });

  // ── Multi-select filtering ──────────────────────────────────────────────

  describe('multi-select column filters', () => {
    test('hasAnyOf matches rows with at least one of the specified options', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const feId = fs.dataSource.columns[5].options[0].id;
      const result = await queryView(client, {
        filters: [{ columnId: TAGS, operator: 'hasAnyOf', value: [feId] }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // [Frontend, Urgent]
      expect(ids).toContain(C); // [Frontend, Backend]
      expect(ids).toContain(F); // [Frontend]
      expect(ids).not.toContain(B); // [Backend]
      expect(ids).not.toContain(E); // []
    });

    test('hasAllOf matches only rows with all specified options', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const feId = fs.dataSource.columns[5].options[0].id;
      const beId = fs.dataSource.columns[5].options[1].id;
      const result = await queryView(client, {
        filters: [{ columnId: TAGS, operator: 'hasAllOf', value: [feId, beId] }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(C); // [Frontend, Backend]
      expect(ids).not.toContain(A); // [Frontend, Urgent] - missing Backend
      expect(ids).not.toContain(B); // [Backend] - missing Frontend
    });

    test('isEmpty on multi-select matches rows with [] or missing tags', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: TAGS, operator: 'isEmpty' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(E); // explicit []
      expect(ids).toContain(D); // missing key
      expect(ids).toContain(H); // missing key
      expect(ids).not.toContain(A); // [Frontend, Urgent]
    });

    test('isNotEmpty on multi-select excludes empty/missing', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [{ columnId: TAGS, operator: 'isNotEmpty' }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A);
      expect(ids).toContain(B);
      expect(ids).not.toContain(E); // explicit []
      expect(ids).not.toContain(D); // missing
    });
  });

  // ── AND-combination filters ─────────────────────────────────────────────

  describe('combined filters', () => {
    test('AND across different column types', async () => {
      const client = await getOwnerClient(getBaseUrl());
      // Active=true AND Score > 5
      const result = await queryView(client, {
        filters: [
          { columnId: ACTIVE, operator: 'equals', value: true },
          { columnId: SCORE, operator: 'gt', value: 5 },
        ],
      });
      const ids = pageIds(result);
      expect(ids).toContain(A); // active=true, score=10
      expect(ids).toContain(C); // active=true, score=20
      expect(ids).not.toContain(F); // active=true, score=0
      expect(ids).not.toContain(B); // active=false
    });

    test('no-match combined filter returns empty', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        filters: [
          { columnId: SCORE, operator: 'gt', value: 100 },
          { columnId: ACTIVE, operator: 'equals', value: true },
        ],
      });
      expect(pageIds(result)).toHaveLength(0);
    });

    test('empty filter array returns all rows', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, { filters: [] });
      expect(pageIds(result)).toHaveLength(8);
    });
  });

  // ── Sorting ─────────────────────────────────────────────────────────────

  describe('sorting', () => {
    test('string sort ascending is case-insensitive', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: LABEL, direction: 'asc' }],
      });
      const ids = pageIds(result);
      // Case-insensitive: Apple, Banana, cherry, Date, elderberry, Fig, grape, Honeydew
      expect(ids[0]).toBe(A); // Apple Item
      expect(ids[1]).toBe(B); // Banana Item
      expect(ids[2]).toBe(C); // cherry Item
    });

    test('number sort ascending with NULLs first', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: SCORE, direction: 'asc' }],
      });
      const ids = pageIds(result);
      // NULL sorts first in asc: D, H (null) then G(-5), F(0), A(10), E(10), C(20), B(30)
      const nullIds = [D, H];
      expect(nullIds).toContain(ids[0]);
      expect(nullIds).toContain(ids[1]);
      // After NULLs: -5, 0, 10, 10, 20, 30
      expect(ids[2]).toBe(G); // -5
      expect(ids[3]).toBe(F); // 0
      // A and E both have score 10 — tie broken by id ASC
      const tie10 = ids.slice(4, 6);
      expect(tie10).toContain(A);
      expect(tie10).toContain(E);
      expect(ids[6]).toBe(C); // 20
      expect(ids[7]).toBe(B); // 30
    });

    test('number sort descending with NULLs last', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: SCORE, direction: 'desc' }],
      });
      const ids = pageIds(result);
      expect(ids[0]).toBe(B); // 30
      expect(ids[1]).toBe(C); // 20
      // A and E both have 10
      const tie10 = ids.slice(2, 4);
      expect(tie10).toContain(A);
      expect(tie10).toContain(E);
      expect(ids[4]).toBe(F); // 0
      expect(ids[5]).toBe(G); // -5
      // NULLs last: D, H
      const nullIds = [D, H];
      expect(nullIds).toContain(ids[6]);
      expect(nullIds).toContain(ids[7]);
    });

    test('boolean sort ascending: false before true', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: ACTIVE, direction: 'asc' }],
      });
      const ids = pageIds(result);
      // NULL first, then false, then true
      const nullIds = [D, H];
      expect(nullIds).toContain(ids[0]);
      expect(nullIds).toContain(ids[1]);
      // false: B, E, G
      const falseIds = [B, E, G];
      expect(falseIds).toContain(ids[2]);
      expect(falseIds).toContain(ids[3]);
      expect(falseIds).toContain(ids[4]);
      // true: A, C, F
      const trueIds = [A, C, F];
      expect(trueIds).toContain(ids[5]);
      expect(trueIds).toContain(ids[6]);
      expect(trueIds).toContain(ids[7]);
    });

    test('date sort ascending', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: DUE, direction: 'asc' }],
      });
      const ids = pageIds(result);
      // NULLs first: D, H
      const nullIds = [D, H];
      expect(nullIds).toContain(ids[0]);
      expect(nullIds).toContain(ids[1]);
      // Then chronological: 2025-01-01 (E), 2025-03-01 (B), 2025-06-15 (A,C,G), 2025-12-31 (F)
      expect(ids[2]).toBe(E); // Jan 1
      expect(ids[3]).toBe(B); // Mar 1
      expect(ids[ids.length - 1]).toBe(F); // Dec 31
    });

    test('multi-sort with mixed directions', async () => {
      const client = await getOwnerClient(getBaseUrl());
      // Sort by Active ASC, then Score DESC
      const result = await queryView(client, {
        sorts: [
          { columnId: ACTIVE, direction: 'asc' },
          { columnId: SCORE, direction: 'desc' },
        ],
      });
      const ids = pageIds(result);
      // Active=null (D,H): D and H, sorted by Score DESC. Both have null score, tie by id.
      // Active=false (B,E,G): B(30), E(10), G(-5)
      // Active=true (A,C,F): C(20), A(10), F(0)
      // Check that false group comes before true group (after nulls)
      const bIndex = ids.indexOf(B);
      const aIndex = ids.indexOf(A);
      expect(bIndex).toBeLessThan(aIndex);
    });

    test('no-sort fallback ordering returns results', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, { sorts: [] });
      expect(pageIds(result)).toHaveLength(8);
    });
  });

  // ── Cursor pagination ───────────────────────────────────────────────────

  describe('cursor pagination', () => {
    test('walks all pages without duplicates or omissions (asc)', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const allIds: string[] = [];
      let cursor: string | null = null;
      let iterations = 0;

      do {
        const result = await queryView(client, {
          sorts: [{ columnId: LABEL, direction: 'asc' }],
          limit: 3,
          ...(cursor ? { cursor } : {}),
        });
        allIds.push(...pageIds(result));
        cursor = result.pagination.nextCursor;
        iterations++;
      } while (cursor && iterations < 10);

      expect(allIds).toHaveLength(8);
      expect(new Set(allIds).size).toBe(8);
    });

    test('walks all pages without duplicates or omissions (desc)', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const allIds: string[] = [];
      let cursor: string | null = null;
      let iterations = 0;

      do {
        const result = await queryView(client, {
          sorts: [{ columnId: SCORE, direction: 'desc' }],
          limit: 2,
          ...(cursor ? { cursor } : {}),
        });
        allIds.push(...pageIds(result));
        cursor = result.pagination.nextCursor;
        iterations++;
      } while (cursor && iterations < 10);

      expect(allIds).toHaveLength(8);
      expect(new Set(allIds).size).toBe(8);
      // Verify ordering: desc by score
      expect(allIds[0]).toBe(B); // 30
    });

    test('walks multi-sort pagination correctly', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const allIds: string[] = [];
      let cursor: string | null = null;
      let iterations = 0;

      do {
        const result = await queryView(client, {
          sorts: [
            { columnId: ACTIVE, direction: 'asc' },
            { columnId: SCORE, direction: 'desc' },
          ],
          limit: 2,
          ...(cursor ? { cursor } : {}),
        });
        allIds.push(...pageIds(result));
        cursor = result.pagination.nextCursor;
        iterations++;
      } while (cursor && iterations < 10);

      expect(allIds).toHaveLength(8);
      expect(new Set(allIds).size).toBe(8);
    });
  });

  // ── Response shape checks ───────────────────────────────────────────────

  describe('response shape', () => {
    test('includeValues=false omits values from entries', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: LABEL, direction: 'asc' }],
        includeValues: false,
      });
      expect(result.data.length).toBe(8);
      for (const entry of result.data) {
        expect(entry.values).toBeUndefined();
        expect(entry.page.id).toBeTruthy();
      }
    });

    test('includeValues=true returns values', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const result = await queryView(client, {
        sorts: [{ columnId: LABEL, direction: 'asc' }],
        includeValues: true,
      });
      // Apple should have values
      const apple = result.data.find((entry) => entry.page.id === A);
      expect(apple?.values).toBeTruthy();
      expect(apple?.values?.[LABEL]?.value).toBe('Apple Item');
    });

    test('anonymous requests are rejected with 401', async () => {
      const client = createAnonymousClient(getBaseUrl());
      const response = await client.get('/api/v1/pages', {
        params: { viewId: VIEW_ID, includeValues: 'true' },
      });
      expect(response.status).toBe(401);
    });
  });

  // ── Persisted vs. inline filters/sorts ──────────────────────────────────

  describe('persisted vs inline overrides', () => {
    test('persisted filters apply to subsequent GETs', async () => {
      const client = await getOwnerClient(getBaseUrl());
      // Persist a filter on the view
      const patchResp = await client.patch(`/api/v1/views/${VIEW_ID}`, {
        filters: [{ columnId: SCORE, operator: 'gt', value: 15 }],
        sorts: [],
      });
      expect(patchResp.ok).toBe(true);

      const result = await queryView(client);
      const ids = pageIds(result);
      expect(ids).toContain(B); // 30
      expect(ids).toContain(C); // 20
      expect(ids).not.toContain(A); // 10
    });

    test('inline filters override persisted config for that request only', async () => {
      const client = await getOwnerClient(getBaseUrl());
      // Persist a filter
      await client.patch(`/api/v1/views/${VIEW_ID}`, {
        filters: [{ columnId: SCORE, operator: 'gt', value: 15 }],
        sorts: [],
      });

      // Override with inline filter
      const result = await queryView(client, {
        filters: [{ columnId: SCORE, operator: 'lt', value: 5 }],
      });
      const ids = pageIds(result);
      expect(ids).toContain(F); // 0
      expect(ids).toContain(G); // -5
      expect(ids).not.toContain(B); // 30

      // A subsequent GET without inline filters should use the persisted config
      const persistedResult = await queryView(client);
      const persistedIds = pageIds(persistedResult);
      expect(persistedIds).toContain(B); // 30
      expect(persistedIds).not.toContain(F); // 0
    });

    test('inline sorts override persisted sorts for that request only', async () => {
      const client = await getOwnerClient(getBaseUrl());
      await client.patch(`/api/v1/views/${VIEW_ID}`, {
        filters: [],
        sorts: [{ columnId: LABEL, direction: 'asc' }],
      });

      // Override with inline sort
      const result = await queryView(client, {
        sorts: [{ columnId: SCORE, direction: 'desc' }],
      });
      expect(pageIds(result)[0]).toBe(B); // 30 first when sorting by Score DESC

      // Persisted config should still be Label ASC
      const persistedResult = await queryView(client);
      expect(pageIds(persistedResult)[0]).toBe(A); // Apple first when sorting by Label ASC
    });
  });

  // ── Validation (400 errors) ─────────────────────────────────────────────

  describe('request validation', () => {
    test('malformed JSON in filters returns 400', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const response = await client.get('/api/v1/pages', {
        params: { viewId: VIEW_ID, filters: '{bad json' },
      });
      expect(response.status).toBe(400);
    });

    test('wrong schema shape in filters returns 400', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const response = await client.get('/api/v1/pages', {
        params: { viewId: VIEW_ID, filters: JSON.stringify([{ wrong: 'shape' }]) },
      });
      expect(response.status).toBe(400);
    });

    test('unknown column ID in filter returns 400', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const response = await client.get('/api/v1/pages', {
        params: {
          viewId: VIEW_ID,
          filters: JSON.stringify([{ columnId: 'non-existent-col', operator: 'equals', value: 'x' }]),
        },
      });
      expect(response.status).toBe(400);
    });

    test('invalid operator for column type returns 400', async () => {
      const client = await getOwnerClient(getBaseUrl());
      // 'contains' is not valid for number columns
      const response = await client.get('/api/v1/pages', {
        params: {
          viewId: VIEW_ID,
          filters: JSON.stringify([{ columnId: SCORE, operator: 'contains', value: '5' }]),
        },
      });
      expect(response.status).toBe(400);
    });

    test('malformed JSON in sorts returns 400', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const response = await client.get('/api/v1/pages', {
        params: { viewId: VIEW_ID, sorts: 'not json' },
      });
      expect(response.status).toBe(400);
    });

    test('wrong schema shape in sorts returns 400', async () => {
      const client = await getOwnerClient(getBaseUrl());
      const response = await client.get('/api/v1/pages', {
        params: { viewId: VIEW_ID, sorts: JSON.stringify([{ bad: true }]) },
      });
      expect(response.status).toBe(400);
    });
  });
});
