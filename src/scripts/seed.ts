import type BetterSqlite3 from 'better-sqlite3';
import type { PageContainerCreate, WorkspaceCreate } from '@/types/database';
import { getContainerRepository, getDatabase, getWorkspaceRepository } from '@/lib/database';

const PREVIEW_USER_ID = 'preview-user-1';

// Initialize the application database first (this runs the schema sync and
// the better-auth migrations), so tables such as `user` and `container`
// already exist by the time we try to seed data into them. Without this the
// seed script can run before the app has ever touched the database (e.g.
// right after a fresh preview deploy, before any request has hit an API
// route), resulting in "no such table" errors.
const superSave = await getDatabase();
const database = superSave.getConnection<BetterSqlite3.Database>();

database.exec(`CREATE TABLE IF NOT EXISTS _seed_marker (id INTEGER PRIMARY KEY)`);

const alreadySeeded = database.prepare('SELECT id FROM _seed_marker LIMIT 1').get();
if (alreadySeeded) {
  console.log('Database already seeded, skipping.');
  database.close();
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

database
  .prepare(
    `
  INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
  VALUES (@id, 'Preview User', 'preview@example.com', 1, datetime('now'), datetime('now'))
`
  )
  .run({ id: PREVIEW_USER_ID });

// Pages are stored by SuperSave behind a generated JSON `contents` column, so
// they must be created through the repository API (which the rest of the
// application also uses) rather than via raw INSERT statements.
const workspaceRepository = await getWorkspaceRepository();
const now = new Date().toISOString();
const workspace = await workspaceRepository.create({
  name: 'Preview Workspace',
  userId: PREVIEW_USER_ID,
  createdAt: now,
  lastUpdated: now,
} satisfies WorkspaceCreate);

const containerRepository = await getContainerRepository();

const samplePages: { name: string; emoji: string; parentName: string | null }[] = [
  { name: 'Welcome', emoji: '👋', parentName: null },
  { name: 'Getting Started', emoji: '🚀', parentName: 'Welcome' },
  { name: 'Architecture', emoji: '🏗️', parentName: null },
];

const createdPageIdsByName = new Map<string, string>();

for (const page of samplePages) {
  const parentId = page.parentName ? (createdPageIdsByName.get(page.parentName) ?? null) : null;

  const pageData: PageContainerCreate = {
    name: page.name,
    type: 'page',
    userId: PREVIEW_USER_ID,
    workspaceId: workspace.id,
    createdAt: now,
    lastUpdated: now,
    emoji: page.emoji,
    parentId,
  };

  const created = await containerRepository.create(pageData);
  createdPageIdsByName.set(page.name, created.id);
}

database.prepare('INSERT INTO _seed_marker (id) VALUES (1)').run();

console.log(`Seeded ${samplePages.length} sample pages.`);
database.close();
