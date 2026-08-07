import Database from 'better-sqlite3';
import path from 'node:path';
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { getBaseUrl, getOwnerClient, SEED } from '../../support/fixtures';

function withDatabase<T>(withOpenDatabase: (database: Database.Database) => T): T {
  const databasePath = path.join(inject('tempDir'), 'integration.db');
  const database = new Database(databasePath);
  try {
    return withOpenDatabase(database);
  } finally {
    database.close();
  }
}

function setLastAccessedAt(pageId: string, lastAccessedAt: string) {
  withDatabase((database) => {
    database
      .prepare(
        `UPDATE container_access SET contents = json_set(contents, '$.lastAccessedAt', ?)
         WHERE containerId = ? AND userId = ?`
      )
      .run(lastAccessedAt, pageId, SEED.user.id);
  });
}

function ageOutEverythingExcept(keepFreshIds: readonly string[], olderThan: string) {
  withDatabase((database) => {
    const placeholders = keepFreshIds.map(() => '?').join(', ');
    database
      .prepare(
        `UPDATE container_access SET contents = json_set(contents, '$.lastAccessedAt', ?)
         WHERE workspaceId = ? AND userId = ? AND containerId NOT IN (${placeholders})`
      )
      .run(olderThan, SEED.workspace.id, SEED.user.id, ...keepFreshIds);
  });
}

async function getOwner() {
  return getOwnerClient(getBaseUrl());
}

describe('recent API', () => {
  beforeAll(() => {
    const baseline = Date.now();
    const keepFreshIds = [
      SEED.pages.root.id,
      SEED.pages.dataSourceHost.id,
      SEED.pages.childOverflowHost.id,
      ...SEED.pages.paginationSeed.map((paginationPage) => paginationPage.id),
    ];

    ageOutEverythingExcept(keepFreshIds, new Date(baseline - 1_000_000).toISOString());
    setLastAccessedAt(SEED.pages.root.id, new Date(baseline + 5000).toISOString());
    setLastAccessedAt(SEED.pages.dataSourceHost.id, new Date(baseline + 4000).toISOString());
    setLastAccessedAt(SEED.pages.childOverflowHost.id, new Date(baseline + 3000).toISOString());
    for (const [index, paginationPage] of SEED.pages.paginationSeed.entries()) {
      setLastAccessedAt(paginationPage.id, new Date(baseline - index * 1000).toISOString());
    }
  });

  test('GET /pages?recent=true satisfies the "one selector required" validation on its own', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages', {
      params: { recent: 'true' },
    });
    expect(response.ok).toBe(true);
  });

  test('GET /pages still requires at least one selector', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages');
    expect(response.status).toBe(400);
  });

  test('GET /pages?recent=true is capped at RECENT_MAX_LIMIT even with a higher limit', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages', {
      params: { recent: 'true', workspaceId: SEED.workspace.id, limit: '50' },
    });
    expect(response.ok).toBe(true);
    const body = await response.json<{ data: unknown[] }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(15);
  });

  test('GET /pages?recent=true returns entries sorted by lastAccessedAt desc, each with a lastAccessedAt field', async () => {
    const client = await getOwner();

    const response = await client.get('/api/v1/pages', {
      params: { recent: 'true', workspaceId: SEED.workspace.id },
    });
    expect(response.ok).toBe(true);
    const body = await response.json<{ data: Array<{ page: { id: string }; lastAccessedAt?: string }> }>();
    const entries = body.data;

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.lastAccessedAt).toBeTruthy();
    }

    const timestamps = entries.map((entry) => Date.parse(entry.lastAccessedAt!));
    for (let index = 1; index < timestamps.length; index++) {
      expect(timestamps[index]).toBeLessThanOrEqual(timestamps[index - 1]!);
    }
  });
});
