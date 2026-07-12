// scripts/e2e-seed.ts
import 'dotenv/config';
import Database from 'better-sqlite3';
import { getContainerRepository, getDatabase, getDataViewRepository, getWorkspaceRepository } from '../src/lib/database/index.js';
import { SEED } from '../tests/e2e/constants.js';
import type { DataSourceContainerCreate, PageContainerCreate, WorkspaceCreate, DataViewCreate } from '../src/types/database/index.js';

const DB_PATH = process.env.DB!.replace('sqlite://', '');

// ── 1. Seed better-auth tables directly via raw SQLite ─────────────────────────
function seedAuthTables() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const now = new Date().toISOString();
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(SEED.user.id, SEED.user.name, SEED.user.email, now, now);

  db.prepare(
    `INSERT OR REPLACE INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('e2e-account-00000000', SEED.user.id, 'credential', SEED.user.id, now, now);

  db.prepare(
    `INSERT OR REPLACE INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(SEED.session.id, farFuture, SEED.session.token, now, now, SEED.user.id);

  db.close();
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
  if (!existingWorkspace) {
    await workspaceRepository.create({
      id: SEED.workspace.id,
      name: 'E2E Workspace',
      userId: uid,
      createdAt: now,
      lastUpdated: now,
    } satisfies WorkspaceCreate & { id: string });
  }

  const wsId = SEED.workspace.id;

  async function upsertPage(data: PageContainerCreate & { id: string }) {
    const existing = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('id', data.id)
    );
    if (!existing) await containerRepository.create(data);
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
    lastUpdated: now,
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

  const existingDs = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', SEED.dataSource.id)
  );
  if (!existingDs) {
    await containerRepository.create({
      id: SEED.dataSource.id,
      name: SEED.dataSource.name,
      type: 'data-source',
      userId: uid,
      workspaceId: wsId,
      parentId: null,
      columns: [...SEED.dataSource.columns],
      createdAt: now,
      lastUpdated: now,
    } satisfies DataSourceContainerCreate & { id: string });
  }

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
    },
  });

  const existingView = await dataViewRepository.getOneByQuery(
    dataViewRepository.createQuery().eq('id', SEED.dataView.id)
  );
  if (!existingView) {
    await dataViewRepository.create({
      id: SEED.dataView.id,
      name: SEED.dataView.name,
      dataSourceId: SEED.dataSource.id,
      userId: uid,
      workspaceId: wsId,
      columns: SEED.dataSource.columns.map((c) => c.id),
      createdAt: now,
      lastUpdated: now,
    } satisfies DataViewCreate & { id: string });
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────
await seedAuthTables();
await seedAppData();
console.log('✅  E2E database seeded');
