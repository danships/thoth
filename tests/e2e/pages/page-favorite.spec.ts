import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Uses a dedicated, always-unstarred-by-default page (`favoriteToggle`) so toggling its
// starred state here never interferes with other specs relying on `SEED.pages.root`.
test.describe('page favorite toggle', () => {
  test.afterEach(async ({ page }) => {
    // Best-effort restore to unstarred so test order/re-runs don't leave stale state behind.
    await page.request.put(`/api/v1/pages/${SEED.pages.favoriteToggle.id}/favorite`, {
      data: { starred: false },
    });
  });

  test('starring a page from the detail header flips the icon to filled and persists across reload', async ({
    page,
  }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    const starButton = page.getByRole('button', { name: 'Star page' });
    await expect(starButton).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starButton.click(),
    ]);
    expect(response.ok()).toBe(true);

    await expect(page.getByRole('button', { name: 'Unstar page' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Unstar page' })).toBeVisible();
  });

  test('unstarring a page reverts the icon back to the outline state', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    const starButton = page.getByRole('button', { name: 'Star page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starButton.click(),
    ]);

    const unstarButton = page.getByRole('button', { name: 'Unstar page' });
    await expect(unstarButton).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      unstarButton.click(),
    ]);

    await expect(page.getByRole('button', { name: 'Star page' })).toBeVisible();
  });

  test('the sidebar Favorites section shows and hides the page as it is starred/unstarred', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    // No Favorites section yet — nothing starred.
    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);

    const starButton = page.getByRole('button', { name: 'Star page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starButton.click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
    await expect(
      page.getByTestId('favorites-tree').getByRole('link', { name: new RegExp(SEED.pages.favoriteToggle.name) })
    ).toBeVisible();

    const unstarButton = page.getByRole('button', { name: 'Unstar page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      unstarButton.click(),
    ]);

    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);
  });

  test('the Favorites section collapses and expands via its chevron toggle', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.favoriteToggle.id}`);

    const starButton = page.getByRole('button', { name: 'Star page' });
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/pages/${SEED.pages.favoriteToggle.id}/favorite`) && response.ok()
      ),
      starButton.click(),
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
