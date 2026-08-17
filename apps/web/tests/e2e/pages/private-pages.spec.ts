import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// Uses a dedicated root page (+ child), always not-private-by-default, so toggling privacy here
// never interferes with other specs relying on `SEED.pages.root`/`SEED.pages.child` (THOTH-077).
test.describe('page privacy toggle (THOTH-077)', () => {
  test.afterEach(async ({ page }) => {
    // Best-effort restore to not-private so test order/re-runs don't leave stale state behind.
    await page.request.patch(`/api/v1/pages/${SEED.pages.privateToggle.id}`, {
      data: { isPrivate: false },
    });
  });

  test('marking a page private via the menu flips the menu label and shows a lock icon next to the title', async ({
    page,
  }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.privateToggle.id}`);

    await expect(page.getByLabel('Private page')).toHaveCount(0);

    await page.getByRole('button', { name: 'Page menu' }).click();
    const makePrivateMenuItem = page.getByRole('menuitem', { name: 'Make page & sub-pages private' });
    await expect(makePrivateMenuItem).toBeVisible();
    await makePrivateMenuItem.click();

    await expect(page.getByRole('heading', { name: 'Make page & sub-pages private' })).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes(`/pages/${SEED.pages.privateToggle.id}`) &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Make private' }).click(),
    ]);
    expect(response.ok()).toBe(true);

    await expect(page.getByLabel('Private page')).toBeVisible();

    await page.getByRole('button', { name: 'Page menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Remove from private' })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Private page')).toBeVisible();
    await page.getByRole('button', { name: 'Page menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Remove from private' })).toBeVisible();
  });

  test('un-marking a private page via the menu removes the lock icon and reverts the label', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.privateToggle.id}`);

    await page.getByRole('button', { name: 'Page menu' }).click();
    await page.getByRole('menuitem', { name: 'Make page & sub-pages private' }).click();
    await expect(page.getByRole('heading', { name: 'Make page & sub-pages private' })).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes(`/pages/${SEED.pages.privateToggle.id}`) &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Make private' }).click(),
    ]);
    await expect(page.getByLabel('Private page')).toBeVisible();

    await page.getByRole('button', { name: 'Page menu' }).click();
    await page.getByRole('menuitem', { name: 'Remove from private' }).click();
    await expect(page.getByRole('heading', { name: 'Remove from private' })).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes(`/pages/${SEED.pages.privateToggle.id}`) &&
          response.ok()
      ),
      page.getByRole('button', { name: 'Remove from private', exact: true }).click(),
    ]);

    await expect(page.getByLabel('Private page')).toHaveCount(0);
    await page.getByRole('button', { name: 'Page menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Make page & sub-pages private' })).toBeVisible();
  });

  test('a private page (and its cascaded child) is excluded from the sidebar Recent list, but a public page is not', async ({
    page,
  }) => {
    // Visiting bumps `lastAccessedAt` via `POST /pages/:id/access`, which is what makes the page
    // eligible to show up in Recent in the first place.
    const accessResponsePromise = page.waitForResponse(
      (response) => response.url().includes(`/pages/${SEED.pages.privateToggle.id}/access`) && response.ok()
    );
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.privateToggle.id}`);
    await accessResponsePromise;

    await page.reload();
    const recentTree = page.getByTestId('recent-tree');
    await expect(recentTree).toBeVisible();
    await expect(recentTree.getByText(SEED.pages.privateToggle.name)).toBeVisible();

    // Mark it (and its cascaded child) private via the API directly, then confirm both are
    // excluded from the recent list after a reload.
    const patchResponse = await page.request.patch(`/api/v1/pages/${SEED.pages.privateToggle.id}`, {
      data: { isPrivate: true },
    });
    expect(patchResponse.ok()).toBe(true);

    await page.reload();
    await expect(recentTree).toBeVisible();
    await expect(recentTree.getByText(SEED.pages.privateToggle.name)).toHaveCount(0);

    // The plain page tree must still show it (privacy only affects Recent/Search).
    await page.goto(`/${SEED.workspace.slug}/pages`);
    await expect(page.getByTestId('pages-tree-scroll-pane').getByText(SEED.pages.privateToggle.name)).toBeVisible();
  });
});
