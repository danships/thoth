import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// A 1x1 transparent PNG, used to fulfill requests to the (fake) cover image URLs below so the
// suite never depends on a real external host being reachable.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test.describe('page cover', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${SEED.coverImage.url}**`, async (route) => {
      await route.fulfill({ contentType: 'image/png', body: PLACEHOLDER_PNG });
    });
    await page.route(`${SEED.coverImage.urlAlt}**`, async (route) => {
      await route.fulfill({ contentType: 'image/png', body: PLACEHOLDER_PNG });
    });
  });

  test.afterEach(async ({ page }) => {
    // Best-effort cleanup: reset the seeded root page back to "no cover" so other specs that
    // load `SEED.pages.root` aren't affected by leftover state from this suite. Wait for either
    // the "Add cover" button or the "Edit cover" icon to appear (the page fetch is async) before
    // deciding whether a cover is present, and wait for the removal to actually complete before
    // the page/context closes — otherwise the in-flight PATCH request gets aborted and the cover
    // lingers for later tests.
    await page.goto(`/pages/${SEED.pages.root.id}`);
    const editButton = page.getByRole('button', { name: 'Edit cover' });
    const addButton = page.getByRole('button', { name: 'Add cover' });
    await Promise.race([
      editButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
      addButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
    ]);
    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click();
      await page.getByRole('button', { name: 'Remove cover' }).click();
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
    await expect(page.getByRole('button', { name: 'Edit cover' })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Edit cover' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit cover' }).click();
    await page.getByRole('button', { name: 'Change image' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.urlAlt);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit cover' })).toBeVisible();
  });

  test('can remove an existing cover', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Edit cover' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit cover' }).click();
    await page.getByRole('button', { name: 'Remove cover' }).click();
    await expect(page.getByRole('button', { name: 'Add cover' })).toBeVisible();
  });

  test('editing the cover reveals a zoom slider and a repositionable preview', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Edit cover' }).click();
    await expect(page.getByRole('slider', { name: 'Cover zoom' })).toBeVisible();

    const preview = page.getByRole('group', { name: /Cover position/ });
    await expect(preview).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('can reposition the cover with the keyboard', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Edit cover' }).click();
    const preview = page.getByRole('group', { name: /Cover position/ });
    await preview.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('cover persists across reloads', async ({ page }) => {
    await page.goto(`/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: 'Add cover' }).click();
    await page.getByLabel('Image URL').fill(SEED.coverImage.url);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Edit cover' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Edit cover' })).toBeVisible();
  });
});
