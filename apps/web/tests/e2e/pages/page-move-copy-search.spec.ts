import { expect, test } from '../fixtures/test';
import { SEED } from '../constants';

test('copy destination picker reuses recent pages and switches to the shared search endpoint', async ({ page }) => {
  const parentOptionsRequests: string[] = [];
  const searchRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/parent-options')) parentOptionsRequests.push(request.url());
    if (new URL(request.url()).pathname.endsWith('/api/v1/search')) searchRequests.push(request.url());
  });

  await page.route('**/api/v1/search**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          results: [
            {
              page: {
                id: SEED.pages.root.id,
                name: 'Search destination',
                emoji: null,
                parentId: null,
                isPrivate: false,
              },
              ancestors: [],
              score: 1,
              snippet: '',
            },
          ],
        },
      }),
    });
  });

  await page.goto(`/${SEED.workspace.slug}/pages/${SEED.pages.child.id}`);
  await page.getByRole('button', { name: 'Page menu' }).click();
  await page.getByTestId('page-copy-button').click();

  const dialog = page.getByRole('dialog', { name: 'Copy page' });
  await expect(dialog.getByText('Workspace root')).toBeVisible();
  await expect(dialog.getByLabel('New parent')).toBeVisible();

  await dialog.getByLabel('New parent').fill('destination');
  await expect(dialog.getByText('Search destination')).toBeVisible();
  expect(searchRequests).toHaveLength(1);
  const searchUrl = new URL(searchRequests[0]!);
  expect(searchUrl.searchParams.get('workspaceId')).toBe(SEED.workspace.id);
  expect(searchUrl.searchParams.get('query')).toBe('destination');
  expect(searchUrl.searchParams.get('type')).toBe('page');
  expect(searchUrl.searchParams.get('limit')).toBe('20');

  await dialog.getByLabel('New parent').fill('   ');
  await expect(dialog.getByText('Workspace root')).toBeVisible();
  expect(parentOptionsRequests).toEqual([]);
});
