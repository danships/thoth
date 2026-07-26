import { execSync } from 'node:child_process';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

const FAVORITES_MAX_LIMIT = 50;

// Bulk-toggles `starred` directly at the database level (bypassing `PUT /pages/:id/favorite`,
// which intentionally also bumps `lastAccessedAt`) so exercising 50+ favorites here doesn't
// permanently disturb the `lastAccessedAt` ordering the root-list pagination specs depend on.
function setFavoritesDirectly(starred: boolean, pageIds: string[]) {
  execSync(`pnpm tsx --env-file=.env.test scripts/set-page-favorites-for-tests.ts ${starred} ${pageIds.join(' ')}`, {
    stdio: 'inherit',
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('favorites sidebar section and GET /pages?favorited filter', () => {
  test('sidebar Favorites section is absent when no pages are starred', async ({ page }) => {
    await page.goto('/pages');
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);
  });

  test('sidebar Favorites section appears once a page is starred', async ({ page }) => {
    const response = await page.request.put(`/api/v1/pages/${SEED.pages.favoritesOverflowSeed[0]!.id}/favorite`, {
      data: { starred: true },
    });
    expect(response.ok()).toBe(true);

    try {
      await page.goto('/pages');
      await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
      await expect(page.getByText(SEED.pages.favoritesOverflowSeed[0]!.name).first()).toBeVisible();
    } finally {
      await page.request.put(`/api/v1/pages/${SEED.pages.favoritesOverflowSeed[0]!.id}/favorite`, {
        data: { starred: false },
      });
    }
  });

  test('GET /pages?favorited=true satisfies the "one selector required" validation on its own', async ({ page }) => {
    const response = await page.request.get('/api/v1/pages?favorited=true');
    expect(response.ok()).toBe(true);
  });

  test('GET /pages still requires at least one selector', async ({ page }) => {
    const response = await page.request.get('/api/v1/pages');
    expect(response.status()).toBe(400);
  });

  test('GET /pages with parentId still works alongside the relaxed favorited validation', async ({ page }) => {
    const response = await page.request.get(`/api/v1/pages?parentId=${SEED.pages.root.id}`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /pages with dataSourceId still works alongside the relaxed favorited validation', async ({ page }) => {
    const response = await page.request.get(`/api/v1/pages?dataSourceId=${SEED.dataSource.id}`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('starring more than FAVORITES_MAX_LIMIT pages surfaces the "may be more" indicator', async ({ page }) => {
    const overflowPages = SEED.pages.favoritesOverflowSeed;
    expect(overflowPages.length).toBeGreaterThan(FAVORITES_MAX_LIMIT);
    const overflowPageIds = overflowPages.map((overflowPage) => overflowPage.id);

    try {
      setFavoritesDirectly(true, overflowPageIds);

      await page.goto('/pages');
      await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
      await expect(page.getByText(/there may be more/i)).toBeVisible();

      const favoritesResponse = await page.request.get('/api/v1/pages?favorited=true');
      expect(favoritesResponse.ok()).toBe(true);
      const favoritesBody = await favoritesResponse.json();
      expect(favoritesBody.data).toHaveLength(FAVORITES_MAX_LIMIT);
    } finally {
      setFavoritesDirectly(false, overflowPageIds);
    }
  });
});
