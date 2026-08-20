import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

test.describe('workspace search', () => {
  test.afterEach(async ({ request }) => {
    await request.patch(`/api/v1/pages/${SEED.pages.privateToggle.id}`, {
      data: { isPrivate: false },
    });
  });

  test('shows the search button beside notifications, opens the modal, and navigates to a title match', async ({
    page,
  }) => {
    await page.route('**/api/v1/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q');

      if (query === SEED.pages.root.name) {
        await route.fulfill({
          json: {
            data: {
              results: [
                {
                  page: {
                    id: SEED.pages.root.id,
                    name: SEED.pages.root.name,
                    emoji: '📄',
                    parentId: null,
                  },
                  score: 0.99,
                  snippet: 'Seeded root page snippet',
                },
              ],
            },
          },
        });
        return;
      }

      await route.fulfill({ json: { data: { results: [] } } });
    });

    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);

    await expect(page.getByRole('button', { name: 'Search pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();

    await page.getByRole('button', { name: 'Search pages' }).click();
    await expect(page.getByRole('dialog', { name: 'Search this workspace' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Search pages' }).fill(SEED.pages.root.name);
    await expect(page.getByRole('button', { name: new RegExp(SEED.pages.root.name) })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(SEED.pages.root.name) }).click();

    const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
    await expect(page).toHaveURL(`${baseUrl}/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
  });

  test('shows empty results and excludes a private page from results', async ({ page, request }) => {
    const patchResponse = await request.patch(`/api/v1/pages/${SEED.pages.privateToggle.id}`, {
      data: { isPrivate: true },
    });
    expect(patchResponse.ok()).toBeTruthy();

    await page.route('**/api/v1/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q');

      if (query === 'no-match-query' || query === SEED.pages.privateToggle.name) {
        await route.fulfill({ json: { data: { results: [] } } });
        return;
      }

      await route.fulfill({ json: { data: { results: [] } } });
    });

    await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.root.id}`);
    await page.getByRole('button', { name: 'Search pages' }).click();

    const input = page.getByRole('textbox', { name: 'Search pages' });
    await input.fill('no-match-query');
    await expect(page.getByText('No pages found')).toBeVisible();

    await input.fill(SEED.pages.privateToggle.name);
    await expect(page.getByText('No pages found')).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(SEED.pages.privateToggle.name) })).toHaveCount(0);
  });
});
