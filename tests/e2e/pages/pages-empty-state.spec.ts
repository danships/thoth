import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import Database from 'better-sqlite3';
import { test, expect } from '../fixtures/test';
import { getDatabase, getWorkspaceMemberRepository, getWorkspaceRepository } from '../../../src/lib/database/index.js';
import { slugify } from '../../../src/lib/utils/slug.js';
import type { WorkspaceCreate, WorkspaceMemberCreate } from '../../../src/types/database/index.js';

// This spec covers the "recreate Welcome page" empty-state flow, which requires a session for
// a user whose workspace has zero root pages. The shared seed user/session (used by every other
// spec via the default storageState) always has pages, so this test creates its own isolated
// user, workspace (with no pages), and session directly against the SQLite database — following
// the same session-isolation pattern already used in `logout.spec.ts`.
test.use({ storageState: { cookies: [], origins: [] } });

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

async function createIsolatedUserWithoutPages() {
  const databasePath = process.env['DB']!.replace('sqlite://', '');
  const userId = `e2e-empty-state-user-${randomUUID()}`;
  const email = `e2e-empty-state-${randomUUID()}@test.local`;
  const password = 'e2e-empty-state-password';
  const passwordHash = await hashPassword(password);

  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`
    )
    .run(userId, 'E2E Empty State User', email, now, now);

  database
    .prepare(
      `INSERT OR REPLACE INTO account (id, accountId, providerId, userId, createdAt, updatedAt, password)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(`e2e-empty-state-account-${randomUUID()}`, userId, 'credential', userId, now, now, passwordHash);

  database.close();

  // Ensure app-level tables (SuperSave) are initialized, then create a workspace with zero pages
  // (skipping the databaseHooks.user.create.after hook that normally seeds a default "Welcome" page).
  await getDatabase();
  const workspaceRepository = await getWorkspaceRepository();
  const workspace = await workspaceRepository.create({
    name: 'Empty Workspace',
    slug: `${slugify('Empty Workspace')}-${randomUUID().slice(0, 8)}`,
    userId,
    deletedAt: null,
    createdAt: now,
    lastUpdated: now,
  } satisfies WorkspaceCreate);

  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  await workspaceMemberRepository.create({
    workspaceId: workspace.id,
    userId,
    role: 'owner',
    createdAt: now,
  } satisfies WorkspaceMemberCreate);

  return { email, password, slug: workspace.slug };
}

test('shows empty-state CTA for a workspace with zero pages, and recreating the Welcome page is idempotent', async ({
  page,
  request,
}) => {
  const { email, password, slug } = await createIsolatedUserWithoutPages();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(`/${slug}/pages`, { timeout: 10_000 });

  await expect(page.getByText('No pages yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recreate Welcome page' })).toBeVisible();

  // Recent (per THOTH-035) is never hidden, even for an empty workspace with zero access rows —
  // it renders its heading and a muted placeholder instead of disappearing.
  await expect(page.getByTestId('recent-tree')).toBeVisible();
  await expect(page.getByTestId('recent-tree').getByText('No recent pages')).toBeVisible();

  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');

  // Call the endpoint twice directly to verify idempotency: the second call must return the
  // same page instead of creating a duplicate.
  const firstResponse = await request.post('/api/v1/pages/welcome', { headers: { cookie: cookieHeader } });
  expect(firstResponse.ok()).toBeTruthy();
  const firstBody = await firstResponse.json();

  const secondResponse = await request.post('/api/v1/pages/welcome', { headers: { cookie: cookieHeader } });
  expect(secondResponse.ok()).toBeTruthy();
  const secondBody = await secondResponse.json();

  expect(secondBody.data.id).toBe(firstBody.data.id);

  await page.getByRole('button', { name: 'Recreate Welcome page' }).click();
  await expect(page).toHaveURL(`/${slug}/pages/${firstBody.data.id}`, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});
