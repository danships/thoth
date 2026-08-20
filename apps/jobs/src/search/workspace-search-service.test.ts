import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import nodePath from 'node:path';
import type { Logger } from 'winston';
import {
  createDatabaseContext,
  getContainerRepository,
  getUploadedFileRepository,
  getWorkspaceRepository,
  resetDatabaseContext,
  setDatabaseContext,
  type AccessGrant,
  type DataSourceContainer,
  type PageContainer,
  type Workspace,
} from '@thoth/database';
import { WorkspaceSearchService } from './workspace-search-service.js';

type FakeEmbeddings = {
  calls: string[];
  maxTokens: number;
  createEmbeddings(inputs: string | string[]): Promise<{ status: 'success'; output: number[][] }>;
};

function createFakeEmbeddings(options?: { delayMs?: number }): FakeEmbeddings {
  const vocabulary = ['alpha', 'beta', 'gamma', 'proposal', 'urgent', 'customer', 'shared', 'child', 'parent', 'private'];
  const toVector = (input: string): number[] => {
    const tokens = input.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return vocabulary.map((term) => tokens.filter((token) => token === term).length);
  };

  return {
    calls: [],
    maxTokens: 512,
    async createEmbeddings(inputs) {
      const normalized = Array.isArray(inputs) ? inputs : [inputs];
      this.calls.push(...normalized);
      if (options?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      return { status: 'success', output: normalized.map(toVector) };
    },
  };
}

function fakeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

describe('WorkspaceSearchService', () => {
  let temporaryDirectory = '';
  let workspaceRepository: Awaited<ReturnType<typeof getWorkspaceRepository>>;
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let uploadedFileRepository: Awaited<ReturnType<typeof getUploadedFileRepository>>;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(process.cwd(), '.workspace-search-service-test-'));
    setDatabaseContext(
      createDatabaseContext({ connectionString: `sqlite://${nodePath.join(temporaryDirectory, 'test.db')}`, skipSync: false })
    );
    workspaceRepository = await getWorkspaceRepository();
    containerRepository = await getContainerRepository();
    uploadedFileRepository = await getUploadedFileRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(nodePath.join(temporaryDirectory, 'indexes'), { recursive: true, force: true });
  });

  async function createWorkspace(id: string): Promise<Workspace> {
    return workspaceRepository.create({
      id,
      name: `Workspace ${id}`,
      slug: id,
      userId: 'user-1',
      deletedAt: null,
      storageQuotaBytes: 1024,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    } as unknown as Parameters<typeof workspaceRepository.create>[0]);
  }

  async function createPage(options: {
    id: string;
    workspaceId: string;
    name?: string;
    content?: string;
    parentId?: string | null;
    isPrivate?: boolean;
    deletedAt?: string | null;
    values?: PageContainer['values'];
    createdAt?: string;
    lastUpdated?: string;
  }): Promise<PageContainer> {
    return containerRepository.create({
      id: options.id,
      name: options.name ?? options.id,
      type: 'page',
      parentId: options.parentId ?? null,
      workspaceId: options.workspaceId,
      userId: 'user-1',
      emoji: null,
      cover: null,
      content: options.content ?? '',
      values: options.values ?? {},
      views: [],
      sortOrder: null,
      createdAt: options.createdAt ?? new Date().toISOString(),
      lastUpdated: options.lastUpdated ?? new Date().toISOString(),
      deletedAt: options.deletedAt ?? null,
      deletedRootId: null,
      isPrivate: options.isPrivate ?? false,
      privateRootId: null,
    } as unknown as Parameters<typeof containerRepository.create>[0]) as Promise<PageContainer>;
  }

  async function createDataSource(options: {
    id: string;
    workspaceId: string;
    columns?: DataSourceContainer['columns'];
    lastUpdated?: string;
  }): Promise<DataSourceContainer> {
    return containerRepository.create({
      id: options.id,
      name: options.id,
      type: 'data-source',
      parentId: null,
      workspaceId: options.workspaceId,
      userId: 'user-1',
      emoji: null,
      sortOrder: null,
      columns: options.columns ?? [],
      createdAt: new Date().toISOString(),
      lastUpdated: options.lastUpdated ?? new Date().toISOString(),
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
    } as unknown as Parameters<typeof containerRepository.create>[0]) as Promise<DataSourceContainer>;
  }

  function createService(fakeEmbeddings = createFakeEmbeddings()): WorkspaceSearchService {
    return new WorkspaceSearchService({
      storageLocalFolder: nodePath.join(temporaryDirectory, 'indexes'),
      modelId: 'fake-model',
      modelCacheDir: nodePath.join(temporaryDirectory, 'model-cache'),
      indexVersion: 1,
      logger: fakeLogger(),
      embeddings: fakeEmbeddings,
    });
  }

  const workspaceGrant = (workspaceId: string): AccessGrant => ({
    workspaceId,
    permission: 'read',
    scopeType: 'workspace',
  });

  test('warmup is a cheap no-op for injected embeddings', async () => {
    const service = createService();
    await expect(service.warmup()).resolves.toBeUndefined();
  });

  test('creates protobuf-backed index files and supports create/update/delete round-trip', async () => {
    await createWorkspace('ws-roundtrip');
    const service = createService();
    const page = await createPage({ id: 'page-a', workspaceId: 'ws-roundtrip', content: 'alpha proposal' });

    expect(await service.syncPage({ workspaceId: page.workspaceId, pageId: page.id })).toBe('created');

    const files = await readdir(nodePath.join(temporaryDirectory, 'indexes', '_search', 'ws-roundtrip'));
    expect(files.some((name) => name.endsWith('.pb'))).toBe(true);
    expect(files).not.toContain('index.json');
    expect(files).not.toContain('catalog.json');

    let results = await service.search({
      workspaceId: 'ws-roundtrip',
      query: 'proposal',
      limit: 10,
      grant: workspaceGrant('ws-roundtrip'),
    });
    expect(results.map((result) => result.pageId)).toEqual(['page-a']);

    await containerRepository.update({ ...page, content: 'gamma proposal', lastUpdated: '2024-01-02T00:00:00.000Z' });
    expect(await service.syncPage({ workspaceId: page.workspaceId, pageId: page.id })).toBe('updated');

    results = await service.search({
      workspaceId: 'ws-roundtrip',
      query: 'gamma',
      limit: 10,
      grant: workspaceGrant('ws-roundtrip'),
    });
    expect(results[0]?.snippet.toLowerCase()).toContain('gamma');

    await containerRepository.deleteUsingId(page.id);
    expect(await service.syncPage({ workspaceId: page.workspaceId, pageId: page.id })).toBe('deleted');
    expect(
      await service.search({ workspaceId: 'ws-roundtrip', query: 'gamma', limit: 10, grant: workspaceGrant('ws-roundtrip') })
    ).toEqual([]);
  });

  test('skips embeddings work for unchanged, private, and deleted pages', async () => {
    await createWorkspace('ws-skip');
    const fakeEmbeddings = createFakeEmbeddings();
    const service = createService(fakeEmbeddings);
    const normalPage = await createPage({ id: 'page-skip', workspaceId: 'ws-skip', content: 'alpha' });

    await service.syncPage({ workspaceId: 'ws-skip', pageId: normalPage.id });
    fakeEmbeddings.calls.length = 0;
    expect(await service.syncPage({ workspaceId: 'ws-skip', pageId: normalPage.id })).toBe('skipped');
    expect(fakeEmbeddings.calls).toEqual([]);

    const privatePage = await createPage({ id: 'page-private', workspaceId: 'ws-skip', content: 'private', isPrivate: true });
    fakeEmbeddings.calls.length = 0;
    expect(await service.syncPage({ workspaceId: 'ws-skip', pageId: privatePage.id })).toBe('deleted');
    expect(fakeEmbeddings.calls).toEqual([]);

    const deletedPage = await createPage({
      id: 'page-deleted',
      workspaceId: 'ws-skip',
      content: 'deleted',
      deletedAt: '2024-01-03T00:00:00.000Z',
    });
    fakeEmbeddings.calls.length = 0;
    expect(await service.syncPage({ workspaceId: 'ws-skip', pageId: deletedPage.id })).toBe('deleted');
    expect(fakeEmbeddings.calls).toEqual([]);
  });

  test('reconcile refreshes only data-source descendants when the parent data source changes', async () => {
    await createWorkspace('ws-reconcile');
    const fakeEmbeddings = createFakeEmbeddings();
    const service = createService(fakeEmbeddings);
    const dataSource = await createDataSource({
      id: 'ds-1',
      workspaceId: 'ws-reconcile',
      columns: [{ id: 'status', name: 'Status', type: 'string' }],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    });
    await createPage({
      id: 'page-ds-1',
      workspaceId: 'ws-reconcile',
      parentId: dataSource.id,
      values: { status: { type: 'string', value: 'alpha' } },
      content: 'alpha',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
    });
    await createPage({
      id: 'page-ds-2',
      workspaceId: 'ws-reconcile',
      parentId: dataSource.id,
      values: { status: { type: 'string', value: 'beta' } },
      content: 'beta',
      createdAt: '2024-01-01T00:00:01.000Z',
      lastUpdated: '2024-01-01T00:00:01.000Z',
    });
    await createPage({
      id: 'page-standalone',
      workspaceId: 'ws-reconcile',
      content: 'shared',
      createdAt: '2024-01-01T00:00:02.000Z',
      lastUpdated: '2024-01-01T00:00:02.000Z',
    });

    await service.reconcileWorkspace('ws-reconcile');
    fakeEmbeddings.calls.length = 0;

    await containerRepository.update({ ...dataSource, lastUpdated: '2024-01-02T00:00:00.000Z' });
    const result = await service.reconcileWorkspace('ws-reconcile');
    expect(result).toMatchObject({ created: 0, updated: 2, skipped: 1 });
    expect(fakeEmbeddings.calls.some((value) => value.includes('shared'))).toBe(false);
  });

  test('isolates search results per workspace and respects grant scopes', async () => {
    await createWorkspace('ws-grant-a');
    await createWorkspace('ws-grant-b');
    const service = createService();
    await createPage({ id: 'ws-a-parent', workspaceId: 'ws-grant-a', content: 'parent alpha' });
    await createPage({ id: 'ws-a-child', workspaceId: 'ws-grant-a', content: 'child alpha', parentId: 'ws-a-parent' });
    await createPage({ id: 'ws-a-unrelated', workspaceId: 'ws-grant-a', content: 'shared alpha' });
    await createPage({ id: 'ws-b-page', workspaceId: 'ws-grant-b', content: 'beta only' });

    await service.reconcileWorkspace('ws-grant-a');
    await service.reconcileWorkspace('ws-grant-b');

    expect(
      (await service.search({ workspaceId: 'ws-grant-a', query: 'alpha', limit: 10, grant: workspaceGrant('ws-grant-a') })).map(
        (result) => result.pageId
      )
    ).not.toContain('ws-b-page');

    const directGrant: AccessGrant = {
      workspaceId: 'ws-grant-a',
      permission: 'read',
      scopeType: 'containers',
      scopedContainerIds: ['ws-a-parent'],
    };
    expect(
      (await service.search({ workspaceId: 'ws-grant-a', query: 'alpha', limit: 10, grant: directGrant })).map(
        (result) => result.pageId
      )
    ).toEqual(['ws-a-parent']);

    const treeGrant: AccessGrant = {
      workspaceId: 'ws-grant-a',
      permission: 'read',
      scopeType: 'containers_with_children',
      scopedContainerIds: ['ws-a-parent'],
    };
    expect(
      new Set(
        (await service.search({ workspaceId: 'ws-grant-a', query: 'alpha', limit: 10, grant: treeGrant })).map(
          (result) => result.pageId
        )
      )
    ).toEqual(new Set(['ws-a-parent', 'ws-a-child']));
  });

  test('bootstraps a missing index on first search and deletes workspace indexes on request', async () => {
    await createWorkspace('ws-bootstrap');
    const service = createService();
    await createPage({ id: 'page-bootstrap', workspaceId: 'ws-bootstrap', content: 'alpha bootstrap' });

    const results = await service.search({
      workspaceId: 'ws-bootstrap',
      query: 'bootstrap',
      limit: 10,
      grant: workspaceGrant('ws-bootstrap'),
    });
    expect(results.map((result) => result.pageId)).toEqual(['page-bootstrap']);

    await service.deleteWorkspaceIndex('ws-bootstrap');
    await expect(readdir(nodePath.join(temporaryDirectory, 'indexes', '_search', 'ws-bootstrap'))).rejects.toThrow();
  });

  test('serializes concurrent syncPage and search calls for the same workspace', async () => {
    await createWorkspace('ws-concurrency');
    const fakeEmbeddings = createFakeEmbeddings({ delayMs: 50 });
    const service = createService(fakeEmbeddings);
    const page = await createPage({ id: 'page-concurrency', workspaceId: 'ws-concurrency', content: 'alpha', lastUpdated: '2024-01-01T00:00:00.000Z' });
    await service.syncPage({ workspaceId: 'ws-concurrency', pageId: page.id });

    await containerRepository.update({ ...page, content: 'gamma', lastUpdated: '2024-01-02T00:00:00.000Z' });
    const [syncResult, searchResults] = await Promise.all([
      service.syncPage({ workspaceId: 'ws-concurrency', pageId: page.id }),
      service.search({ workspaceId: 'ws-concurrency', query: 'gamma', limit: 10, grant: workspaceGrant('ws-concurrency') }),
    ]);

    expect(syncResult).toBe('updated');
    expect(searchResults.map((result) => result.pageId)).toEqual(['page-concurrency']);
  });

  test('formats file values in search documents and skips missing file references', async () => {
    await createWorkspace('ws-files');
    const service = createService();
    await uploadedFileRepository.create({
      id: 'file-search-1',
      filename: 'proposal.pdf',
      mimeType: 'application/pdf',
      size: 1,
      extension: 'pdf',
      storageKey: 'workspace/file-search-1',
      storageType: 'local',
      workspaceId: 'ws-files',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
    } as unknown as Parameters<typeof uploadedFileRepository.create>[0]);
    await createDataSource({
      id: 'ds-files',
      workspaceId: 'ws-files',
      columns: [{ id: 'attachment', name: 'Attachment', type: 'file' }],
    });
    await createPage({
      id: 'page-file',
      workspaceId: 'ws-files',
      parentId: 'ds-files',
      content: 'proposal alpha',
      values: { attachment: { type: 'file', value: 'file-search-1' } },
    });
    await createPage({
      id: 'page-missing-file',
      workspaceId: 'ws-files',
      parentId: 'ds-files',
      content: 'missing alpha',
      values: { attachment: { type: 'file', value: 'missing' } },
    });

    await service.reconcileWorkspace('ws-files');
    const results = await service.search({
      workspaceId: 'ws-files',
      query: 'proposal',
      limit: 10,
      grant: workspaceGrant('ws-files'),
    });
    expect(results[0]?.pageId).toBe('page-file');
  });
});
