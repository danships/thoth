import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';
import type { APIRequestContext } from '@playwright/test';

async function setPageEmoji(request: APIRequestContext, pageId: string, emoji: string | null) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await request.patch(`/api/v1/pages/${pageId}`, { data: { emoji } });
      expect(response.ok()).toBe(true);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

// Reads the current favicon `<link>` href, resolving to an absolute URL/data-URI the same way
// the browser does, so a relative `/favicon.ico` and an already-absolute `data:image/png;...`
// href can both be compared reliably.
async function getFaviconHref(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? '');
}

test.describe('page favicon', () => {
  test.beforeEach(async ({ request }) => {
    await setPageEmoji(request, SEED.pages.root.id, null);
    await setPageEmoji(request, SEED.pages.child.id, null);
  });

  test.afterEach(async ({ request }) => {
    // Restore the seeded root page emoji (📄) so other specs relying on `SEED.pages.root`
    // aren't affected by leftover state from this suite.
    await setPageEmoji(request, SEED.pages.root.id, '📄');
    await setPageEmoji(request, SEED.pages.child.id, null);
  });

  test('replaces the favicon with the page emoji, and restores it when leaving the page', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    const defaultFavicon = await getFaviconHref(page);
    expect(defaultFavicon).toContain('favicon.ico');

    await page.getByRole('button', { name: /set page emoji/i }).click();
    await page.getByLabel('Search emojis').fill('rocket');
    await page.getByRole('button', { name: 'rocket' }).click();
    await expect(page.getByRole('button', { name: /change page emoji/i })).toContainText('🚀');

    await expect.poll(() => getFaviconHref(page)).toMatch(/^data:image\/png/);

    // Navigate to the home/pages list, away from the page entirely — the favicon should be
    // restored to the site default rather than staying stuck on the emoji.
    await page.goto(`/${SEED.workspace.slug}/pages`);
    await expect.poll(() => getFaviconHref(page)).toBe(defaultFavicon);
  });

  test('leaves the default favicon in place for a page without an emoji', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);

    const favicon = await getFaviconHref(page);
    expect(favicon).toContain('favicon.ico');
  });
});
