import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from './context.js';
import { getContainerRepository, getDataViewRepository } from './repositories.js';
import type { AccessGrant } from './access-grant-service.js';
import type { DataSourceContainer, PageContainer } from './types.js';

describe('access-grant-service', () => {
  let temporaryDirectory = '';
  let containerRepository: Awaited<ReturnType<typeof getContainerRepository>>;
  let dataViewRepository: Awaited<ReturnType<typeof getDataViewRepository>>;
  let grantAllowsContainer: (typeof import('./access-grant-service.js'))['grantAllowsContainer'];
  let filterContainersByGrant: (typeof import('./access-grant-service.js'))['filterContainersByGrant'];

  const workspaceId = 'workspace-1';

  let counter = 0;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-access-grant-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');

    // Explicit, isolated context (skipSync so SuperSave creates the schema for this fresh temp
    // file directly) — no environment variables, no shared/module-level default beyond this
    // test file's own registration.
    setDatabaseContext(createDatabaseContext({ connectionString: `sqlite://${databaseFile}`, skipSync: false }));

    const accessGrantServiceModule = await import('./access-grant-service.js');

    containerRepository = await getContainerRepository();
    dataViewRepository = await getDataViewRepository();
    grantAllowsContainer = accessGrantServiceModule.grantAllowsContainer;
    filterContainersByGrant = accessGrantServiceModule.filterContainersByGrant;
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createTestDataSource(): Promise<DataSourceContainer> {
    counter += 1;
    const now = new Date(Date.now() + counter).toISOString();
    const created = await containerRepository.create({
      name: `Test data source ${counter}`,
      type: 'data-source',
      parentId: null,
      workspaceId,
      userId: 'user-1',
      emoji: null,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
      sortOrder: null,
      columns: [],
    } as Parameters<typeof containerRepository.create>[0]);
    return created as DataSourceContainer;
  }

  async function createTestPage(options: { parentId?: string | null; views?: string[] } = {}): Promise<PageContainer> {
    counter += 1;
    const now = new Date(Date.now() + counter).toISOString();
    const created = await containerRepository.create({
      name: `Test page ${counter}`,
      type: 'page',
      parentId: options.parentId ?? null,
      workspaceId,
      userId: 'user-1',
      emoji: null,
      lastUpdated: now,
      createdAt: now,
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
      sortOrder: null,
      values: {},
      views: options.views ?? [],
    } as Parameters<typeof containerRepository.create>[0]);
    return created as PageContainer;
  }

  async function embedDataSourceOnPage(page: PageContainer, dataSource: DataSourceContainer): Promise<PageContainer> {
    const now = new Date().toISOString();
    const dataView = await dataViewRepository.create({
      workspaceId,
      dataSourceId: dataSource.id,
      name: 'Embedded view',
      userId: 'user-1',
      columns: [],
      filters: [],
      sorts: [],
      columnLayout: null,
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
      createdAt: now,
      lastUpdated: now,
    } as Parameters<typeof dataViewRepository.create>[0]);

    const updated = await containerRepository.update({ ...page, views: [...(page.views ?? []), dataView.id] });
    return updated as PageContainer;
  }

  // Regression coverage for the THOTH-061 review finding: a `containers_with_children` grant
  // scoped directly to a page must still implicitly permit the data source(s) that page embeds
  // (via a data view) — data sources are never granted on their own.
  describe('containers_with_children scope with an embedded data source', () => {
    test('grantAllowsContainer permits the embedded data source of a directly-scoped page', async () => {
      const dataSource = await createTestDataSource();
      let page = await createTestPage();
      page = await embedDataSourceOnPage(page, dataSource);

      const grant: AccessGrant = {
        workspaceId,
        permission: 'read_write',
        scopeType: 'containers_with_children',
        scopedContainerIds: [page.id],
      };

      await expect(grantAllowsContainer(grant, dataSource)).resolves.toBe(true);
    });

    test('grantAllowsContainer permits the embedded data source of a descendant page', async () => {
      const dataSource = await createTestDataSource();
      const parent = await createTestPage();
      let child = await createTestPage({ parentId: parent.id });
      child = await embedDataSourceOnPage(child, dataSource);

      const grant: AccessGrant = {
        workspaceId,
        permission: 'read_write',
        scopeType: 'containers_with_children',
        scopedContainerIds: [parent.id],
      };

      await expect(grantAllowsContainer(grant, dataSource)).resolves.toBe(true);
      await expect(grantAllowsContainer(grant, child)).resolves.toBe(true);
    });

    test('filterContainersByGrant keeps the embedded data source of a directly-scoped page', async () => {
      const dataSource = await createTestDataSource();
      let page = await createTestPage();
      page = await embedDataSourceOnPage(page, dataSource);
      const unrelatedDataSource = await createTestDataSource();

      const grant: AccessGrant = {
        workspaceId,
        permission: 'read_write',
        scopeType: 'containers_with_children',
        scopedContainerIds: [page.id],
      };

      const filtered = await filterContainersByGrant(grant, [page, dataSource, unrelatedDataSource]);
      expect(filtered.map((container) => container.id).toSorted()).toEqual([dataSource.id, page.id].toSorted());
    });
  });
});
