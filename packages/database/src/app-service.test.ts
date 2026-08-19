import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, resetDatabaseContext, setDatabaseContext } from './context.js';
import { getContainerRepository, getDataViewRepository } from './repositories.js';
import { resolveHostPageIdsForDataSource, resolveLiveAncestorIdsBridgingDataSources } from './app-service.js';
import type { DataSourceContainer, PageContainer } from './types.js';

describe('embedded data-source ancestry', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let dataViewRepository: Awaited<ReturnType<typeof getDataViewRepository>>;
  const workspaceId = 'workspace-1';

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-app-service-test-'));
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${nodePath.join(temporaryDirectory, 'test.db')}`, skipSync: false }));
    containerRepository = await getContainerRepository();
    dataViewRepository = await getDataViewRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    for (const row of await dataViewRepository.getByQuery(dataViewRepository.createQuery())) await dataViewRepository.deleteUsingId(row.id);
    for (const row of await containerRepository.getByQuery(containerRepository.createQuery())) await containerRepository.deleteUsingId(row.id);
  });

  async function createPage(id: string, options: { parentId?: string | null; views?: string[]; deletedAt?: string | null } = {}): Promise<PageContainer> {
    const now = new Date().toISOString();
    return containerRepository.create({
      id, name: id, type: 'page', parentId: options.parentId ?? null, workspaceId, userId: 'user-1', emoji: null,
      values: {}, views: options.views ?? [], createdAt: now, lastUpdated: now, deletedAt: options.deletedAt ?? null,
      deletedRootId: null, sortOrder: null, isPrivate: false, privateRootId: null,
    } as Parameters<typeof containerRepository.create>[0]) as unknown as Promise<PageContainer>;
  }

  async function createDataSource(id: string): Promise<DataSourceContainer> {
    const now = new Date().toISOString();
    return containerRepository.create({
      id, name: id, type: 'data-source', parentId: null, workspaceId, userId: 'user-1', emoji: null,
      columns: [], createdAt: now, lastUpdated: now, deletedAt: null, deletedRootId: null, sortOrder: null,
      isPrivate: false, privateRootId: null,
    } as Parameters<typeof containerRepository.create>[0]) as unknown as Promise<DataSourceContainer>;
  }

  async function embed(page: PageContainer, dataSourceId: string, id: string, deletedAt: string | null = null): Promise<PageContainer> {
    const now = new Date().toISOString();
    await dataViewRepository.create({
      id, workspaceId, dataSourceId, name: id, userId: 'user-1', columns: [], filters: [], sorts: [], columnLayout: null,
      createdAt: now, lastUpdated: now, deletedAt, deletedRootId: null, isPrivate: false, privateRootId: null,
    } as Parameters<typeof dataViewRepository.create>[0]);
    return containerRepository.update({ ...page, views: [...(page.views ?? []), id] }) as Promise<PageContainer>;
  }

  test('bridges a row through its data source to the host page and parent pages', async () => {
    const root = await createPage('root');
    const host = await createPage('host', { parentId: root.id });
    const dataSource = await createDataSource('data-source');
    await embed(host, dataSource.id, 'view');
    const row = await createPage('row', { parentId: dataSource.id });

    await expect(resolveLiveAncestorIdsBridgingDataSources({ workspaceId, container: row })).resolves.toEqual([
      dataSource.id, host.id, root.id,
    ]);
  });

  test('returns every live host, excludes deleted views/pages, and terminates cycles', async () => {
    let hostOne = await createPage('host-one');
    const hostTwo = await createPage('host-two');
    const deletedHost = await createPage('deleted-host', { deletedAt: new Date().toISOString() });
    const dataSource = await createDataSource('data-source');
    hostOne = await embed(hostOne, dataSource.id, 'view-one');
    await embed(hostTwo, dataSource.id, 'view-two');
    await embed(deletedHost, dataSource.id, 'view-deleted-host');
    await embed(hostOne, dataSource.id, 'view-deleted', new Date().toISOString());
    const row = await createPage('row', { parentId: dataSource.id });

    await expect(resolveHostPageIdsForDataSource(dataSource.id, workspaceId)).resolves.toEqual([hostOne.id, hostTwo.id]);
    await expect(resolveLiveAncestorIdsBridgingDataSources({ workspaceId, container: row })).resolves.toEqual([
      dataSource.id, hostOne.id, hostTwo.id,
    ]);

    await containerRepository.update({ ...hostOne, parentId: dataSource.id });
    await expect(resolveLiveAncestorIdsBridgingDataSources({ workspaceId, container: row, maxAncestors: 10 })).resolves.toEqual([
      dataSource.id, hostOne.id, hostTwo.id,
    ]);
  });

  test('keeps an orphaned row scoped to its data-source ancestor only', async () => {
    const dataSource = await createDataSource('orphaned-data-source');
    const row = await createPage('row', { parentId: dataSource.id });

    await expect(resolveHostPageIdsForDataSource(dataSource.id, workspaceId)).resolves.toEqual([]);
    await expect(resolveLiveAncestorIdsBridgingDataSources({ workspaceId, container: row })).resolves.toEqual([dataSource.id]);
    await expect(resolveLiveAncestorIdsBridgingDataSources({ workspaceId, container: dataSource })).resolves.toEqual([]);
  });
});
