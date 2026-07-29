// scripts/end-to-end-seed.ts
import 'dotenv/config';
import { scrypt, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  getContainerAccessRepository,
  getContainerRepository,
  getDatabase,
  getDataViewRepository,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
} from '../src/lib/database/index.js';
import { SEED } from '../tests/e2e/constants.js';
import type {
  ContainerAccessCreate,
  DataSourceContainer,
  DataSourceContainerCreate,
  PageContainerCreate,
  WorkspaceCreate,
  WorkspaceMemberCreate,
  DataViewCreate,
} from '../src/types/database/index.js';
import type { Column } from '../src/types/schemas/entities/container.js';

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

  database
    .prepare(
      `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, ?, ?)`
    )
    .run(SEED.user.id, SEED.user.name, SEED.user.email, now, now);

  database
    .prepare(
      `INSERT OR REPLACE INTO account (id, accountId, providerId, userId, createdAt, updatedAt, password)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run('e2e-account-00000000', SEED.user.id, 'credential', SEED.user.id, now, now, passwordHash);

  database
    .prepare(
      `INSERT OR REPLACE INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(SEED.session.id, farFuture, SEED.session.token, now, now, SEED.user.id);

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

  // Pages that only exist to support other fixtures (breadcrumbs, data-source rows, the child
  // overflow preview, etc.) shouldn't compete for a slot in the Recent sidebar section
  // (THOTH-035), which is scoped across *all* pages (root and nested) sorted by
  // `lastAccessedAt` desc — not just root-level ones like the paginated root list. Without an
  // explicit offset these would otherwise tie with `paginationSeed`'s entries (all seeded off
  // the same `now` timestamp), making Recent's ordering nondeterministic. Kept comfortably
  // older than every `paginationSeed` entry (oldest offset: -29s) so they never enter its
  // top-`RECENT_MAX_LIMIT` window.
  const OLD_ACCESS_TIMESTAMP = new Date(Date.parse(now) - 1_000_000).toISOString();

  // Workspace
  const existingWorkspace = await workspaceRepository.getOneByQuery(
    workspaceRepository.createQuery().eq('id', SEED.workspace.id)
  );
  await (existingWorkspace
    ? workspaceRepository.update({
        ...existingWorkspace,
        name: 'E2E Workspace',
        slug: SEED.workspace.slug,
        deletedAt: null,
        lastUpdated: now,
      })
    : workspaceRepository.create({
        id: SEED.workspace.id,
        name: 'E2E Workspace',
        slug: SEED.workspace.slug,
        userId: uid,
        deletedAt: null,
        createdAt: now,
        lastUpdated: now,
      } as unknown as WorkspaceCreate));

  const wsId = SEED.workspace.id;

  // WorkspaceMember — authorization now derives from this table (not `Workspace.userId`), so
  // every e2e workspace lookup/authorization check depends on this row existing.
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const existingMembership = await workspaceMemberRepository.getOneByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', wsId).eq('userId', uid)
  );
  if (!existingMembership) {
    await workspaceMemberRepository.create({
      workspaceId: wsId,
      userId: uid,
      role: 'owner',
      createdAt: now,
    } as unknown as WorkspaceMemberCreate);
  }

  // ── Second workspace (multi-workspace fixtures) ──────────────────────────────
  // An independent, active workspace owned by the same user, with its own membership row and a
  // single root page, so switching/isolation/legacy-redirect specs have a real target that is
  // guaranteed not to share any content with the primary workspace above. Its `lastUpdated` is
  // kept strictly older than the primary workspace's so `getDefaultWorkspaceForUser` (which
  // sorts by `lastUpdated` desc) deterministically lands users in the primary workspace — many
  // existing specs assert on that default-landing behaviour.
  const secondWorkspaceId = SEED.secondWorkspace.id;
  const secondWorkspaceTimestamp = new Date(Date.parse(now) - 60_000).toISOString();
  const existingSecondWorkspace = await workspaceRepository.getOneByQuery(
    workspaceRepository.createQuery().eq('id', secondWorkspaceId)
  );
  await (existingSecondWorkspace
    ? workspaceRepository.update({
        ...existingSecondWorkspace,
        name: 'E2E Second Workspace',
        slug: SEED.secondWorkspace.slug,
        deletedAt: null,
        lastUpdated: secondWorkspaceTimestamp,
      })
    : workspaceRepository.create({
        id: secondWorkspaceId,
        name: 'E2E Second Workspace',
        slug: SEED.secondWorkspace.slug,
        userId: uid,
        deletedAt: null,
        createdAt: secondWorkspaceTimestamp,
        lastUpdated: secondWorkspaceTimestamp,
      } as unknown as WorkspaceCreate));

  const existingSecondMembership = await workspaceMemberRepository.getOneByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', secondWorkspaceId).eq('userId', uid)
  );
  if (!existingSecondMembership) {
    await workspaceMemberRepository.create({
      workspaceId: secondWorkspaceId,
      userId: uid,
      role: 'owner',
      createdAt: now,
    } as unknown as WorkspaceMemberCreate);
  }

  const containerAccessRepository = await getContainerAccessRepository();

  async function upsertContainerAccess(
    page: { id: string; parentId: string | null; workspaceId: string },
    lastAccessedAt: string
  ) {
    const existingAccess = await containerAccessRepository.getOneByQuery(
      containerAccessRepository.createQuery().eq('containerId', page.id).eq('userId', uid)
    );
    await (existingAccess
      ? containerAccessRepository.update({
          ...existingAccess,
          parentId: page.parentId,
          lastAccessedAt,
          starred: false,
          starredAt: null,
        })
      : containerAccessRepository.create({
          userId: uid,
          containerId: page.id,
          parentId: page.parentId,
          workspaceId: page.workspaceId,
          lastAccessedAt,
          starred: false,
          starredAt: null,
          createdAt: lastAccessedAt,
        } as unknown as ContainerAccessCreate));
  }

  async function upsertPage(data: PageContainerCreate & { id: string }, options?: { lastAccessedAt?: string }) {
    const existing = await containerRepository.getOneByQuery(containerRepository.createQuery().eq('id', data.id));
    await (existing
      ? containerRepository.update({ ...existing, ...data, lastUpdated: now })
      : containerRepository.create(data as unknown as PageContainerCreate));

    // Mirrors the app's own page-creation flow: every page gets a `ContainerAccess` row for
    // its owning user, `parentId` denormalized from the container's own `parentId`.
    await upsertContainerAccess(
      { id: data.id, parentId: data.parentId ?? null, workspaceId: data.workspaceId },
      options?.lastAccessedAt ?? data.createdAt
    );
  }

  await upsertPage(
    {
      id: SEED.pages.root.id,
      name: SEED.pages.root.name,
      emoji: '📄',
      type: 'page',
      userId: uid,
      workspaceId: wsId,
      parentId: null,
      createdAt: now,
      // Seeded markdown body: verifies markdown -> BlockNote hydration renders a heading on
      // the Contents tab (see `tests/e2e/pages/page-detail.spec.ts`).
      content: `# ${SEED.pages.root.contentHeading}`,
      // `/pages` redirects to the most-recently-updated root page. This must stay strictly
      // later than `pages.dataSourceHost.lastUpdated` (both are root pages, `parentId: null`)
      // so the redirect target is deterministic across test runs/DB engines instead of relying
      // on a tie-break that could vary.
      lastUpdated: new Date(Date.parse(now) + 1000).toISOString(),
    },
    // Keep this comfortably more recent than any `paginationSeed`/`childOverflowHost` entry so
    // it deterministically lands on the first page of the cursor-paginated root list.
    { lastAccessedAt: new Date(Date.parse(now) + 5000).toISOString() }
  );

  await upsertPage(
    {
      id: SEED.pages.child.id,
      name: SEED.pages.child.name,
      emoji: '📝',
      type: 'page',
      userId: uid,
      workspaceId: wsId,
      parentId: SEED.pages.root.id,
      createdAt: now,
      lastUpdated: now,
    },
    { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
  );

  await upsertPage(
    {
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
    },
    { lastAccessedAt: new Date(Date.parse(now) + 4000).toISOString() }
  );

  // Deeply nested chain (each page is the child of the previous one, rooted under
  // `pages.root`), used to exercise the breadcrumb collapse-into-dropdown behavior.
  for (const [index, deepPage] of SEED.pages.deepChain.entries()) {
    const parentId = index === 0 ? SEED.pages.root.id : SEED.pages.deepChain[index - 1]!.id;
    await upsertPage(
      {
        id: deepPage.id,
        name: deepPage.name,
        emoji: '📁',
        type: 'page',
        userId: uid,
        workspaceId: wsId,
        parentId,
        createdAt: now,
        lastUpdated: now,
      },
      { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
    );
  }

  await upsertPage(
    {
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
    },
    { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
  );

  const existingDs = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', SEED.dataSource.id)
  );
  await (existingDs
    ? containerRepository.update({
        ...(existingDs as DataSourceContainer),
        name: SEED.dataSource.name,
        columns: [...SEED.dataSource.columns] as Column[],
        lastUpdated: now,
      })
    : containerRepository.create({
        id: SEED.dataSource.id,
        name: SEED.dataSource.name,
        type: 'data-source',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        columns: [...SEED.dataSource.columns] as Column[],
        createdAt: now,
        lastUpdated: now,
      } as unknown as DataSourceContainerCreate));

  await upsertPage(
    {
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
        [SEED.dataSource.columns[3].id]: { type: 'single-select', value: SEED.dataSource.columns[3].options[1].id },
      },
    },
    { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
  );

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

  await upsertPage(
    {
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
    },
    { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
  );

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
        columns: [...fieldsSeed.dataSource.columns] as Column[],
        lastUpdated: now,
      })
    : containerRepository.create({
        id: fieldsSeed.dataSource.id,
        name: fieldsSeed.dataSource.name,
        type: 'data-source',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        columns: [...fieldsSeed.dataSource.columns] as Column[],
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

  await upsertPage(
    {
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
    },
    { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
  );

  // ── Child-overflow test fixture ──────────────────────────────────────────────
  // A root page with more children (12) than CHILD_PREVIEW_LIMIT (10), used to verify the
  // sidebar shows a "more inside" indicator instead of listing/paginating all of them inline.
  await upsertPage(
    {
      id: SEED.pages.childOverflowHost.id,
      name: SEED.pages.childOverflowHost.name,
      emoji: '📚',
      type: 'page',
      userId: uid,
      workspaceId: wsId,
      parentId: null,
      createdAt: now,
      lastUpdated: now,
    },
    { lastAccessedAt: new Date(Date.parse(now) + 3000).toISOString() }
  );

  for (const child of SEED.pages.childOverflowHost.children) {
    await upsertPage(
      {
        id: child.id,
        name: child.name,
        emoji: null,
        type: 'page',
        userId: uid,
        workspaceId: wsId,
        parentId: SEED.pages.childOverflowHost.id,
        createdAt: now,
        lastUpdated: now,
      },
      { lastAccessedAt: OLD_ACCESS_TIMESTAMP }
    );
  }

  // ── Root-list pagination test fixtures ───────────────────────────────────────
  // 30 root-level pages with staggered, strictly descending `lastAccessedAt` values (each one
  // second earlier than the previous), giving a deterministic cursor-pagination sort order:
  // pagination page 0 is the most-recently-accessed of the batch, page 29 the least.
  for (const [index, page] of SEED.pages.paginationSeed.entries()) {
    await upsertPage(
      {
        id: page.id,
        name: page.name,
        emoji: null,
        type: 'page',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        createdAt: now,
        lastUpdated: now,
      },
      { lastAccessedAt: new Date(Date.parse(now) - index * 1000).toISOString() }
    );
  }

  // ── Second workspace's own root page ─────────────────────────────────────────
  // Belongs to `secondWorkspace` (not `wsId`), so it must never appear in the primary
  // workspace's tree — this is exactly what the isolation specs assert.
  await upsertPage({
    id: SEED.secondWorkspace.rootPage.id,
    name: SEED.secondWorkspace.rootPage.name,
    emoji: '🗂️',
    type: 'page',
    userId: uid,
    workspaceId: SEED.secondWorkspace.id,
    parentId: null,
    createdAt: now,
    lastUpdated: now,
  });

  // ── Favorites test fixtures ───────────────────────────────────────────────────
  // A dedicated root page, seeded unstarred, used to exercise starring/unstarring from the
  // page detail header and the resulting Favorites sidebar section. Seeded with a
  // deliberately old `lastAccessedAt` (well before the pagination fixtures below) so it
  // doesn't shift the root-list pagination tests' expected first-page ordering.
  await upsertPage(
    {
      id: SEED.pages.favoriteToggle.id,
      name: SEED.pages.favoriteToggle.name,
      emoji: '⭐',
      type: 'page',
      userId: uid,
      workspaceId: wsId,
      parentId: null,
      createdAt: now,
      lastUpdated: now,
    },
    { lastAccessedAt: new Date(Date.parse(now) - 1_000_000).toISOString() }
  );

  // A pool of unstarred root pages the favorites-overflow e2e spec stars/unstars on demand
  // (via the API) to exceed FAVORITES_MAX_LIMIT and verify the "may be more" indicator,
  // without permanently seeding starred state that would break the "no favorites" test.
  // Seeded with deliberately old, strictly descending `lastAccessedAt` values (same rationale
  // as `favoriteToggle` above) so this pool never shifts the root-list pagination ordering.
  for (const [index, page] of SEED.pages.favoritesOverflowSeed.entries()) {
    await upsertPage(
      {
        id: page.id,
        name: page.name,
        emoji: null,
        type: 'page',
        userId: uid,
        workspaceId: wsId,
        parentId: null,
        createdAt: now,
        lastUpdated: now,
      },
      { lastAccessedAt: new Date(Date.parse(now) - 1_000_000 - index * 1000).toISOString() }
    );
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────
await getDatabase(); // ensures Better Auth tables exist via runMigrations
await seedAuthTables();
await seedAppData();
console.log('✅  E2E database seeded');
