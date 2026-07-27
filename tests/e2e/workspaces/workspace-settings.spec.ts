import { test, expect } from '../fixtures/test';

// Covers the Workspace Settings page added in response to THOTH-027 review feedback: renaming
// a workspace's name/slug (with the old slug then redirecting to the new one via the
// WorkspaceSlugRedirect fallback), and the "can't delete your only workspace" guard. Renaming
// and deletion are exercised against a disposable workspace created via the API rather than the
// shared seeded one, so this spec doesn't interfere with other specs relying on
// `SEED.workspace`.
test.describe('workspace settings', () => {
  test.describe('brand new user', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('disables deleting the only workspace a fresh user has', async ({ page }) => {
      // Sign up a brand new user so it starts with exactly one workspace (the seeded e2e user
      // ends up with several once other specs in this suite create extras via the API).
      await page.goto('/signup');
      const uniqueEmail = `e2e-settings-${Date.now()}@test.local`;
      await page.getByLabel('Name').fill('E2E Settings User');
      await page.getByLabel('Email').fill(uniqueEmail);
      await page.getByLabel('Password', { exact: true }).fill('Password123!');
      await page.getByLabel('Confirm Password').fill('Password123!');
      await page.getByRole('button', { name: 'Sign Up' }).click();

      await expect(page).toHaveURL(/\/[^/]+\/pages\/(?!create)[^/]+$/, { timeout: 10_000 });
      const workspaceSlug = /^\/([^/]+)\//.exec(new URL(page.url()).pathname)?.[1];

      await page.goto(`/${workspaceSlug}/settings`);
      await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete workspace' })).toBeDisabled();
    });
  });

  test('can rename a workspace and change its slug, with the old slug redirecting to the new one', async ({
    page,
    request,
  }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: `E2E Settings Workspace ${Date.now()}` },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const created = createBody.data as { id: string; slug: string; name: string };

    await page.goto(`/${created.slug}/settings`);
    await expect(page.getByRole('heading', { name: 'Workspace settings' })).toBeVisible();

    const newName = `Renamed Workspace ${Date.now()}`;
    const newSlug = `renamed-workspace-${Date.now()}`;

    await page.getByLabel('Workspace name').fill(newName);
    await page.getByLabel('URL slug').fill(newSlug);
    await expect(page.getByText('Available')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Slug changed: the page navigates to the new canonical URL.
    await expect(page).toHaveURL(`/${newSlug}/settings`, { timeout: 10_000 });
    await expect(page.getByLabel('Workspace name')).toHaveValue(newName);

    // The old slug is preserved in the WorkspaceSlugRedirect table and still resolves, landing
    // on the same (now-renamed) workspace's settings page.
    await page.goto(`/${created.slug}/settings`);
    await expect(page).toHaveURL(`/${newSlug}/settings`, { timeout: 10_000 });
  });

  test('deleting a workspace redirects to another remaining workspace', async ({ page, request }) => {
    const createResponse = await request.post('/api/v1/workspaces', {
      data: { name: `E2E Delete Workspace ${Date.now()}` },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createBody = await createResponse.json();
    const created = createBody.data as { id: string; slug: string; name: string };

    await page.goto(`/${created.slug}/settings`);
    await page.getByRole('button', { name: 'Delete workspace' }).click();
    // The confirmation now requires typing the workspace name before the delete button enables.
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Confirm workspace name').fill(created.name);
    await dialog.getByRole('button', { name: 'Delete workspace' }).click();

    await expect(page).toHaveURL(/\/[^/]+\/pages$/, { timeout: 10_000 });
  });

  test('a freed slug can be reclaimed by another workspace, which then supersedes the old redirect', async ({
    page,
    request,
  }) => {
    const oldSlug = `super-old-${Date.now()}`;
    const newSlug = `super-new-${Date.now()}`;

    // Workspace A takes `oldSlug`, then renames away from it — freeing `oldSlug`, which now only
    // survives as a redirect pointing at A's new slug.
    const aResponse = await request.post('/api/v1/workspaces', { data: { name: `Supersession A ${Date.now()}` } });
    const aBody = await aResponse.json();
    const workspaceA = aBody.data as { id: string };
    const aToOld = await request.patch(`/api/v1/workspaces/${workspaceA.id}`, { data: { slug: oldSlug } });
    expect(aToOld.ok()).toBeTruthy();
    const aToNew = await request.patch(`/api/v1/workspaces/${workspaceA.id}`, { data: { slug: newSlug } });
    expect(aToNew.ok()).toBeTruthy();

    // Right now the freed slug redirects to A's new slug.
    await page.goto(`/${oldSlug}/pages`);
    await expect(page).toHaveURL(`/${newSlug}/pages`, { timeout: 15_000 });

    // Workspace B reclaims the freed `oldSlug`.
    const bResponse = await request.post('/api/v1/workspaces', { data: { name: `Supersession B ${Date.now()}` } });
    const bBody = await bResponse.json();
    const workspaceB = bBody.data as { id: string };
    const bToOld = await request.patch(`/api/v1/workspaces/${workspaceB.id}`, { data: { slug: oldSlug } });
    expect(bToOld.ok()).toBeTruthy();

    // An active workspace matching the slug wins over the stale redirect, so the old slug now
    // resolves directly to B and no longer bounces to A's new slug.
    await page.goto(`/${oldSlug}/pages`);
    await expect(page).toHaveURL(`/${oldSlug}/pages`, { timeout: 15_000 });
  });
});
