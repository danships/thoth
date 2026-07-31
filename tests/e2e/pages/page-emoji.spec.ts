import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import type { APIRequestContext } from '@playwright/test';

async function setPageEmoji(request: APIRequestContext, emoji: string | null) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await request.patch(`/api/v1/pages/${SEED.pages.root.id}`, { data: { emoji } });
      expect(response.ok()).toBe(true);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

test.describe('page emoji', () => {
  test.beforeEach(async ({ request }) => {
    // The seeded root page ships with a default emoji (📄), so start every test from a known
    // "no emoji" baseline regardless of the seed's default or leftover state from other specs.
    await setPageEmoji(request, null);
  });

  test.afterEach(async ({ request }) => {
    // Restore the seeded root page emoji (📄) so other specs that load `SEED.pages.root`
    // aren't affected by leftover state from this suite.
    await setPageEmoji(request, '📄');
  });

  test('shows an "add emoji" affordance when none set', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
    await expect(page.getByRole('button', { name: /set page emoji/i })).toBeVisible();
  });

  test('can pick an emoji', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: /set page emoji/i }).click();
    await page.getByLabel('Search emojis').fill('rocket');
    await page.getByRole('button', { name: 'rocket' }).click();

    await expect(page.getByRole('button', { name: /change page emoji/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /change page emoji/i })).toContainText('🚀');
  });

  test('can change it', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: /set page emoji/i }).click();
    await page.getByLabel('Search emojis').fill('rocket');
    await page.getByRole('button', { name: 'rocket' }).click();
    await expect(page.getByRole('button', { name: /change page emoji/i })).toContainText('🚀');

    await page.getByRole('button', { name: /change page emoji/i }).click();
    await page.getByLabel('Search emojis').fill('sparkles');
    await page.getByRole('button', { name: 'sparkles' }).click();

    await expect(page.getByRole('button', { name: /change page emoji/i })).toContainText('✨');
  });

  test('can remove/clear it', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: /set page emoji/i }).click();
    await page.getByLabel('Search emojis').fill('rocket');
    await page.getByRole('button', { name: 'rocket' }).click();
    await expect(page.getByRole('button', { name: /change page emoji/i })).toBeVisible();

    await page.getByRole('button', { name: /change page emoji/i }).click();
    await page.getByRole('button', { name: 'Remove emoji' }).click();

    await expect(page.getByRole('button', { name: /set page emoji/i })).toBeVisible();
  });

  test('persists across page.reload()', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    await page.getByRole('button', { name: /set page emoji/i }).click();
    await page.getByLabel('Search emojis').fill('rocket');
    await page.getByRole('button', { name: 'rocket' }).click();
    await expect(page.getByRole('button', { name: /change page emoji/i })).toContainText('🚀');

    await page.reload();
    await expect(page.getByRole('button', { name: /change page emoji/i })).toContainText('🚀');
  });
});
