// Load environment variables from a `.env` file (if present) before anything
// else runs. Next.js loads `.env` files automatically for the `node server.js`
// process, but this script is executed directly via `tsx` (e.g. `docker exec`
// during preview environment provisioning), which does not load `.env` files
// on its own, so `DB` and other required variables would otherwise be
// undefined even though they are configured for the running container.
//
// `dotenv/config`'s default behaviour resolves `.env` relative to
// `process.cwd()`. During preview provisioning this script may be invoked
// with a different working directory than `/app` (e.g. via `docker exec`
// after a fresh `pnpm install`), which would silently skip loading the
// `.env` file docker-entrypoint.sh wrote at container start, leaving `DB`
// and other required variables undefined. Resolve the path explicitly
// relative to this script's own location instead, so it works regardless of
// the invoking process's working directory.
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(scriptDirectory, '../../.env') });

import type BetterSqlite3 from 'better-sqlite3';
import type { PageContainerCreate, WorkspaceCreate, WorkspaceMemberCreate } from '@/types/database';
import {
  getContainerRepository,
  getDatabase,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
} from '@/lib/database';
import { slugify } from '@/lib/utils/slug';
import { registerPlatformUser } from '@/lib/auth/platform-user';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';

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

// THOTH-045: build the platform-user projection for the raw-inserted preview user so it becomes
// the platform administrator (it's the only/earliest user on a fresh preview database).
await registerPlatformUser({ id: PREVIEW_USER_ID, name: 'Preview User', email: 'preview@example.com' });

// Pages are stored by SuperSave behind a generated JSON `contents` column, so
// they must be created through the repository API (which the rest of the
// application also uses) rather than via raw INSERT statements.
const workspaceRepository = await getWorkspaceRepository();
const now = new Date().toISOString();
const workspace = await workspaceRepository.create({
  name: 'Preview Workspace',
  slug: slugify('Preview Workspace'),
  userId: PREVIEW_USER_ID,
  deletedAt: null,
  createdAt: now,
  lastUpdated: now,
  storageQuotaBytes: DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
} satisfies WorkspaceCreate);

const workspaceMemberRepository = await getWorkspaceMemberRepository();
await workspaceMemberRepository.create({
  workspaceId: workspace.id,
  userId: PREVIEW_USER_ID,
  role: 'owner',
  permission: 'read_write',
  scopeType: 'workspace',
  createdAt: now,
} satisfies WorkspaceMemberCreate);

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
    deletedAt: null,
    deletedRootId: null,
  };

  const created = await containerRepository.create(pageData);
  createdPageIdsByName.set(page.name, created.id);
}

database.prepare('INSERT INTO _seed_marker (id) VALUES (1)').run();

console.log(`Seeded ${samplePages.length} sample pages.`);
database.close();
