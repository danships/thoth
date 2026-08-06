import { execFileSync } from 'node:child_process';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import { FAVORITES_MAX_LIMIT } from '@/types/api';

// Bulk-toggles `starred` directly at the database level (bypassing `PUT /pages/:id/favorite`,
// which intentionally also bumps `lastAccessedAt`) so exercising 50+ favorites here doesn't
// permanently disturb the `lastAccessedAt` ordering the root-list pagination specs depend on.
function setFavoritesDirectly(starred: boolean, pageIds: string[]) {
  execFileSync(
    'pnpm',
    ['tsx', '--env-file=.env.test', 'scripts/set-page-favorites-for-tests.ts', String(starred), ...pageIds],
    { stdio: 'inherit' }
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('favorites sidebar section', () => {
  test('sidebar Favorites section is absent when no pages are starred', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);
  });

  test('sidebar Favorites section appears once a page is starred', async ({ page }) => {
    const response = await page.request.put(`/api/v1/pages/${SEED.pages.favoritesOverflowSeed[0]!.id}/favorite`, {
      data: { starred: true },
    });
    expect(response.ok()).toBe(true);

    try {
      await page.goto(`/${SEED.workspace.slug}/pages`);
      await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
      await expect(page.getByText(SEED.pages.favoritesOverflowSeed[0]!.name).first()).toBeVisible();
    } finally {
      await page.request.put(`/api/v1/pages/${SEED.pages.favoritesOverflowSeed[0]!.id}/favorite`, {
        data: { starred: false },
      });
    }
  });

  test('starring more than FAVORITES_MAX_LIMIT pages surfaces the "may be more" indicator', async ({ page }) => {
    const overflowPages = SEED.pages.favoritesOverflowSeed;
    expect(overflowPages.length).toBeGreaterThan(FAVORITES_MAX_LIMIT);
    const overflowPageIds = overflowPages.map((overflowPage) => overflowPage.id);

    try {
      setFavoritesDirectly(true, overflowPageIds);

      await page.goto(`/${SEED.workspace.slug}/pages`);
      await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
      await expect(page.getByText(/there may be more/i)).toBeVisible();

      const favoritesResponse = await page.request.get(`/api/v1/pages?favorited=true&workspaceId=${SEED.workspace.id}`);
      expect(favoritesResponse.ok()).toBe(true);
      const favoritesBody = await favoritesResponse.json();
      expect(favoritesBody.data).toHaveLength(FAVORITES_MAX_LIMIT);
    } finally {
      setFavoritesDirectly(false, overflowPageIds);
    }
  });
});
