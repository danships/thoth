import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.describe('page cover', () => {
  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: reset the seeded root page back to "no cover" so other specs that
    // load `SEED.pages.root` aren't affected by leftover state from this suite. Wait for either
    // button to appear (the page fetch is async) before deciding whether a cover is present, and
    // wait for the removal to actually complete before the page/context closes — otherwise the
    // in-flight PATCH request gets aborted and the cover lingers for later tests.
    await page.goto(`/pages/${SEED.pages.root.id}`);
    const removeButton = page.getByRole('button', { name: 'Remove cover' });
    const addButton = page.getByRole('button', { name: 'Add cover' });
    await Promise.race([
      removeButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
      addButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
    ]);
    if (await removeButton.isVisible().catch(() => false)) {
      await removeButton.click();
      await expect(addButton).toBeVisible();
    }
  });

  test('shows an "Add cover" button when the page has no cover', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);
    await expect(page.getByRole('button', { name: 'Add cover' })).toBeVisible();
  });

  test('can add a cover image via URL', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Change image' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible();
  });

  test('disables Save for an invalid image URL', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill('not-a-valid-url');

    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('can change the cover image after one is set', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Change image' })).toBeVisible();

    await page.getByRole('button', { name: 'Change image' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.urlAlt);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible();
  });

  test('can remove an existing cover', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove cover' }).click();
    await expect(page.getByRole('button', { name: 'Add cover' })).toBeVisible();
  });

  test('reposition mode reveals a zoom slider', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Reposition cover' }).click();
    await expect(page.getByRole('slider', { name: 'Cover zoom' })).toBeVisible();

    await page.getByRole('button', { name: 'Done repositioning' }).click();
    await expect(page.getByRole('slider', { name: 'Cover zoom' })).not.toBeVisible();
  });

  test('cover persists across reloads', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Change image' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove cover' })).toBeVisible();
  });
});
