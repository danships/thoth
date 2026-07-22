// scripts/end-to-end-seed.ts
import 'dotenv/config';
import { scrypt, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { getContainerRepository, getDatabase, getDataViewRepository, getWorkspaceRepository } from '../src/lib/database/index.js';
import { SEED } from '../tests/e2e/constants.js';
import type { DataSourceContainer, DataSourceContainerCreate, PageContainerCreate, WorkspaceCreate, DataViewCreate } from '../src/types/database/index.js';

const DB_PATH = process.env['DB']!.replace('sqlite://', '');

/**
 * Hashes a password using scrypt — the same algorithm and parameters that better-auth uses.
 * Format: `${saltHex}:${keyHex}`
 */
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex');
    scrypt(
      password.normalize('NFKC'),
      salt,
      64,
      { N: 16_384, r: 16, p: 1, maxmem: 128 * 16_384 * 16 * 2 },
      (error, key) => {
        if (error) reject(error);
        else resolve(`${salt}:${(key as Buffer).toString('hex')}`);
      }
    );
  });
}

// ── 1. Seed better-auth tables directly via raw SQLite ─────────────────────────
async function seedAuthTables() {
  const passwordHash = await hashPassword(SEED.user.password);
  const database = new Database(DB_PATH);
  database.pragma('journal_mode = WAL');
  const now = new Date().toISOString();
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  database.prepare(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(SEED.user.id, SEED.user.name, SEED.user.email, now, now);

  database.prepare(
    `INSERT OR REPLACE INTO account (id, accountId, providerId, userId, createdAt, updatedAt, password)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('e2e-account-00000000', SEED.user.id, 'credential', SEED.user.id, now, now, passwordHash);

  database.prepare(
    `INSERT OR REPLACE INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(SEED.session.id, farFuture, SEED.session.token, now, now, SEED.user.id);

  database.close();
}

// ── 2. Seed SuperSave entities via the app repository layer ────────────────────
async function seedAppData() {
  await getDatabase();

  const workspaceRepository = await getWorkspaceRepository();
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();

  const now = new Date().toISOString();
  const uid = SEED.user.id;

  // Workspace
  const existingWorkspace = await workspaceRepository.getOneByQuery(
    workspaceRepository.createQuery().eq('id', SEED.workspace.id)
  );
  await (existingWorkspace
    ? workspaceRepository.update({
        ...existingWorkspace,
        name: 'E2E Workspace',
        lastUpdated: now,
      })
    : workspaceRepository.create({
        id: SEED.workspace.id,
        name: 'E2E Workspace',
        userId: uid,
        createdAt: now,
        lastUpdated: now,
      } as unknown as WorkspaceCreate));

  const wsId = SEED.workspace.id;

  async function upsertPage(data: PageContainerCreate & { id: string }) {
    const existing = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', data.id)
    );
    await (existing
      ? containerRepository.update({ ...existing, ...data, lastUpdated: now })
      : containerRepository.create(data as unknown as PageContainerCreate));
  }

  await upsertPage({
    id: SEED.pages.root.id,
    name: SEED.pages.root.name,
    emoji: '📄',
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: null,
    createdAt: now,
    // `/pages` redirects to the most-recently-updated root page. This must stay strictly
    // later than `pages.dataSourceHost.lastUpdated` (both are root pages, `parentId: null`)
    // so the redirect target is deterministic across test runs/DB engines instead of relying
    // on a tie-break that could vary.
    lastUpdated: new Date(Date.parse(now) + 1000).toISOString(),
  });

  await upsertPage({
    id: SEED.pages.child.id,
    name: SEED.pages.child.name,
    emoji: '📝',
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: SEED.pages.root.id,
    createdAt: now,
    lastUpdated: now,
  });

  await upsertPage({
    id: SEED.pages.dataSourceHost.id,
    name: SEED.pages.dataSourceHost.name,
    emoji: '📊',
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: null,
    createdAt: now,
    lastUpdated: now,
    views: [SEED.dataView.id],
  });

  // Deeply nested chain (each page is the child of the previous one, rooted under
  // `pages.root`), used to exercise the breadcrumb collapse-into-dropdown behavior.
  for (const [index, deepPage] of SEED.pages.deepChain.entries()) {
    const parentId = index === 0 ? SEED.pages.root.id : SEED.pages.deepChain[index - 1]!.id;
    await upsertPage({
      id: deepPage.id,
      name: deepPage.name,
      emoji: '📁',
      type: 'page',
      userId: uid,
      workspaceId: wsId,
      parentId,
      createdAt: now,
      lastUpdated: now,
    });
  }

  await upsertPage({
    id: SEED.pages.breadcrumbDataSourceHost.id,
    name: SEED.pages.breadcrumbDataSourceHost.name,
    emoji: '📊',
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: SEED.pages.root.id,
    createdAt: now,
    lastUpdated: now,
    views: [SEED.breadcrumbDataView.id],
  });

  const existingDs = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', SEED.dataSource.id)
  );
  await (existingDs
    ? containerRepository.update({
        ...(existingDs as DataSourceContainer),
        name: SEED.dataSource.name,
        columns: [...SEED.dataSource.columns],
        lastUpdated: now,
      })
    : containerRepository.create({
        id: SEED.dataSource.id,
        name: SEED.dataSource.name,
        type: 'data-source',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        columns: [...SEED.dataSource.columns],
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataSourceContainerCreate));

  await upsertPage({
    id: SEED.dataSourcePage.id,
    name: SEED.dataSourcePage.name,
    emoji: null,
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: SEED.dataSource.id,
    createdAt: now,
    lastUpdated: now,
    values: {
      [SEED.dataSource.columns[0].id]: { type: 'string', value: 'Seeded note' },
      [SEED.dataSource.columns[1].id]: { type: 'boolean', value: false },
      [SEED.dataSource.columns[2].id]: { type: 'date', value: '2026-01-31T00:00:00.000Z' },
    },
  });

  const existingView = await dataViewRepository.getOneByQuery(
    dataViewRepository.createQuery().eq('id', SEED.dataView.id)
  );
  await (existingView
    ? dataViewRepository.update({
        ...existingView,
        name: SEED.dataView.name,
        columns: SEED.dataSource.columns.map((c) => c.id),
        lastUpdated: now,
      })
    : dataViewRepository.create({
        id: SEED.dataView.id,
        name: SEED.dataView.name,
        dataSourceId: SEED.dataSource.id,
        userId: uid,
        workspaceId: wsId,
        columns: SEED.dataSource.columns.map((c) => c.id),
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataViewCreate));

  // ── Breadcrumb test fixtures ─────────────────────────────────────────────────
  // Reproduces: root page -> sub-page -> data source (hosted on the sub-page via a view)
  // -> row page. The row's `parentId` points at the data source container, not the
  // sub-page, so breadcrumb traversal must bridge through the data source's hosting
  // page to reach the sub-page and root.
  const existingBreadcrumbDs = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', SEED.breadcrumbDataSource.id)
  );
  await (existingBreadcrumbDs
    ? containerRepository.update({
        ...(existingBreadcrumbDs as DataSourceContainer),
        name: SEED.breadcrumbDataSource.name,
        columns: [...SEED.breadcrumbDataSource.columns],
        lastUpdated: now,
      })
    : containerRepository.create({
        id: SEED.breadcrumbDataSource.id,
        name: SEED.breadcrumbDataSource.name,
        type: 'data-source',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        columns: [...SEED.breadcrumbDataSource.columns],
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataSourceContainerCreate));

  const existingBreadcrumbView = await dataViewRepository.getOneByQuery(
    dataViewRepository.createQuery().eq('id', SEED.breadcrumbDataView.id)
  );
  await (existingBreadcrumbView
    ? dataViewRepository.update({
        ...existingBreadcrumbView,
        name: SEED.breadcrumbDataView.name,
        columns: SEED.breadcrumbDataSource.columns.map((c) => c.id),
        lastUpdated: now,
      })
    : dataViewRepository.create({
        id: SEED.breadcrumbDataView.id,
        name: SEED.breadcrumbDataView.name,
        dataSourceId: SEED.breadcrumbDataSource.id,
        userId: uid,
        workspaceId: wsId,
        columns: SEED.breadcrumbDataSource.columns.map((c) => c.id),
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataViewCreate));

  await upsertPage({
    id: SEED.breadcrumbRowPage.id,
    name: SEED.breadcrumbRowPage.name,
    emoji: null,
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: SEED.breadcrumbDataSource.id,
    createdAt: now,
    lastUpdated: now,
    values: {
      [SEED.breadcrumbDataSource.columns[0].id]: { type: 'string', value: 'Seeded breadcrumb note' },
    },
  });

  // ── Fields tab test fixtures ─────────────────────────────────────────────────
  // A dedicated data source/view/page combo, kept separate from the fixtures above so
  // reordering its columns can't affect other specs that assert on cell positions.
  const fieldsSeed = SEED.fieldsTab;

  const existingFieldsDs = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', fieldsSeed.dataSource.id)
  );
  await (existingFieldsDs
    ? containerRepository.update({
        ...(existingFieldsDs as DataSourceContainer),
        name: fieldsSeed.dataSource.name,
        columns: [...fieldsSeed.dataSource.columns],
        lastUpdated: now,
      })
    : containerRepository.create({
        id: fieldsSeed.dataSource.id,
        name: fieldsSeed.dataSource.name,
        type: 'data-source',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        columns: [...fieldsSeed.dataSource.columns],
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataSourceContainerCreate));

  // Reversed relative to fieldsSeed.dataSource.columns' own stored order, so the Fields tab
  // rendering can be asserted to follow the DataView's order rather than the raw column list.
  const reorderedColumnIds = [...fieldsSeed.dataSource.columns].toReversed().map((c) => c.id);

  const existingFieldsView = await dataViewRepository.getOneByQuery(
    dataViewRepository.createQuery().eq('id', fieldsSeed.dataView.id)
  );
  await (existingFieldsView
    ? dataViewRepository.update({
        ...existingFieldsView,
        name: fieldsSeed.dataView.name,
        columns: reorderedColumnIds,
        lastUpdated: now,
      })
    : dataViewRepository.create({
        id: fieldsSeed.dataView.id,
        name: fieldsSeed.dataView.name,
        dataSourceId: fieldsSeed.dataSource.id,
        userId: uid,
        workspaceId: wsId,
        columns: reorderedColumnIds,
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataViewCreate));

  await upsertPage({
    id: fieldsSeed.page.id,
    name: fieldsSeed.page.name,
    emoji: null,
    type: 'page',
    userId: uid,
    workspaceId: wsId,
    parentId: fieldsSeed.dataSource.id,
    createdAt: now,
    lastUpdated: now,
    values: {
      [fieldsSeed.dataSource.columns[0].id]: { type: 'string', value: 'Initial alpha' },
      [fieldsSeed.dataSource.columns[1].id]: { type: 'boolean', value: false },
    },
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────
await getDatabase(); // ensures Better Auth tables exist via runMigrations
await seedAuthTables();
await seedAppData();
console.log('✅  E2E database seeded');
