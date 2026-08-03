import Database from 'better-sqlite3';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Restores `favoriteToggle`'s `ContainerAccess.lastAccessedAt` directly at the database level
// (bypassing `PUT /pages/:id/favorite`, which intentionally bumps `lastAccessedAt` on starring
// and never reverts it on unstarring). Without this, once any test below stars the page, its
// `lastAccessedAt` permanently becomes "now" for the remainder of the suite run, which would
// otherwise leak into the sidebar's Recent section (THOTH-035, see `recent-tree.spec.ts`) and
// the root-list pagination ordering in other specs.
function restoreLastAccessedAt(pageId: string, lastAccessedAt: string) {
  const databasePath = process.env['DB']!.replace('sqlite://', '');
  const database = new Database(databasePath);
  database
    .prepare(
      `UPDATE container_access SET contents = json_set(contents, '$.lastAccessedAt', ?)
       WHERE containerId = ? AND userId = ?`
    )
    .run(lastAccessedAt, pageId, SEED.user.id);
  database.close();
}

function readLastAccessedAt(pageId: string): string {
  const databasePath = process.env['DB']!.replace('sqlite://', '');
  const database = new Database(databasePath);
  const row = database
    .prepare(`SELECT "lastAccessedAt" FROM container_access WHERE containerId = ? AND userId = ?`)
    .get(pageId, SEED.user.id) as { lastAccessedAt: string };
  database.close();
  return row.lastAccessedAt;
}

// Uses a dedicated, always-unstarred-by-default page (`favoriteToggle`) so toggling its
// starred state here never interferes with other specs relying on `SEED.pages.root`.
test.describe('page favorite toggle', () => {
  let originalLastAccessedAt: string;

  test.beforeAll(() => {
    // Deferred to `beforeAll` (rather than the describe body) since the seed database doesn't
    // exist yet at test-collection time — only after the `setup` project has run.
    originalLastAccessedAt = readLastAccessedAt(SEED.pages.favoriteToggle.id);
  });

  test.afterEach(async ({ page }) => {
    // Best-effort restore to unstarred so test order/re-runs don't leave stale state behind.
    await page.request.put(`/api/v1/pages/${SEED.pages.favoriteToggle.id}/favorite`, {
      data: { starred: false },
    });
    restoreLastAccessedAt(SEED.pages.favoriteToggle.id, originalLastAccessedAt);
  });

  test('starring a page from the detail menu flips the icon/label and persists across reload', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    await page.getByRole('button', { name: 'Page menu' }).click();
    const starMenuItem = page.getByRole('menuitem', { name: 'Star Page' });
    await expect(starMenuItem).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starMenuItem.click(),
    ]);
    expect(response.ok()).toBe(true);

    await page.getByRole('button', { name: 'Page menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Unstar Page' })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Page menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Unstar Page' })).toBeVisible();
  });

  test('unstarring a page reverts the menu item back to the outline state', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    await page.getByRole('button', { name: 'Page menu' }).click();
    const starMenuItem = page.getByRole('menuitem', { name: 'Star Page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starMenuItem.click(),
    ]);

    await page.getByRole('button', { name: 'Page menu' }).click();
    const unstarMenuItem = page.getByRole('menuitem', { name: 'Unstar Page' });
    await expect(unstarMenuItem).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      unstarMenuItem.click(),
    ]);

    await page.getByRole('button', { name: 'Page menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Star Page' })).toBeVisible();
  });

  test('the sidebar Favorites section shows and hides the page as it is starred/unstarred', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    // No Favorites section yet — nothing starred.
    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Page menu' }).click();
    const starMenuItem = page.getByRole('menuitem', { name: 'Star Page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starMenuItem.click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
    await expect(
      page.getByTestId('favorites-tree').getByRole('link', { name: new RegExp(SEED.pages.favoriteToggle.name) })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Page menu' }).click();
    const unstarMenuItem = page.getByRole('menuitem', { name: 'Unstar Page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      unstarMenuItem.click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);
  });

  test('the Favorites section collapses and expands via its chevron toggle', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    await page.getByRole('button', { name: 'Page menu' }).click();
    const starMenuItem = page.getByRole('menuitem', { name: 'Star Page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starMenuItem.click(),
    ]);

    const favoriteLink = page.getByTestId('favorites-tree').getByRole('link', {
      name: new RegExp(SEED.pages.favoriteToggle.name),
    });
    await expect(favoriteLink).toBeVisible();

    const collapseButton = page.getByRole('button', { name: 'Collapse favorites' });
    await expect(collapseButton).toBeVisible();
    await collapseButton.click();

    await expect(page.getByRole('button', { name: 'Expand favorites' })).toBeVisible();
    await expect(favoriteLink).toBeHidden();

    await page.getByRole('button', { name: 'Expand favorites' }).click();
    await expect(page.getByRole('button', { name: 'Collapse favorites' })).toBeVisible();
    await expect(favoriteLink).toBeVisible();
  });

  test('starring a page bumps it to the top of the root pages tree', async ({ page }) => {
    // Star via the API directly (not by visiting the page detail first) so this only exercises
    // the "starring bumps lastAccessedAt" side effect, not the separate "opening a page bumps
    // lastAccessedAt" behavior from `POST /pages/:id/access`.
    const response = await page.request.put(`/api/v1/pages/${SEED.pages.favoriteToggle.id}/favorite`, {
      data: { starred: true },
    });
    expect(response.ok()).toBe(true);

    await page.goto(`/${SEED.workspace.slug}/pages`);

    // The root tree is ordered by lastAccessedAt desc, and starring bumps it to "now" (well
    // after any of the seeded fixture timestamps), so it should render above the seeded root
    // page fixture.
    const favoriteToggleLink = page.getByRole('link', { name: new RegExp(SEED.pages.favoriteToggle.name) }).first();
    const rootLink = page.getByRole('link', { name: new RegExp(SEED.pages.root.name) }).first();
    await expect(favoriteToggleLink).toBeVisible();
    await expect(rootLink).toBeVisible();

    const favoriteToggleBox = await favoriteToggleLink.boundingBox();
    const rootBox = await rootLink.boundingBox();
    expect(favoriteToggleBox).not.toBeNull();
    expect(rootBox).not.toBeNull();
    expect(favoriteToggleBox!.y).toBeLessThan(rootBox!.y);
  });
});
