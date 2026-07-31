import Database from 'better-sqlite3';
import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

function withDatabase<T>(withOpenDatabase: (database: Database.Database) => T): T {
  const databasePath = process.env['DB']!.replace('sqlite://', '');
  const database = new Database(databasePath);
  try {
    return withOpenDatabase(database);
  } finally {
    database.close();
  }
}

function setLastAccessedAt(pageId: string, lastAccessedAt: string) {
  withDatabase((database) => {
    database
      .prepare(
        `UPDATE container_access SET contents = json_set(contents, '$.lastAccessedAt', ?)
         WHERE containerId = ? AND userId = ?`
      )
      .run(lastAccessedAt, pageId, SEED.user.id);
  });
}

function getLastAccessedAt(pageId: string): string {
  const row = withDatabase((database) =>
    database
      .prepare(`SELECT "lastAccessedAt" FROM container_access WHERE containerId = ? AND userId = ?`)
      .get(pageId, SEED.user.id)
  ) as { lastAccessedAt: string };
  return row.lastAccessedAt;
}

// Ages out every `ContainerAccess` row in the primary workspace except the ones passed in
// `keepFreshIds`, so pages dynamically created/opened by *other* e2e specs (e.g.
// `create-page.spec.ts` creates several root pages; many other specs open `root`/
// `dataSourceHost`/etc. directly, bumping `lastAccessedAt` to "now") can never leak into this
// spec's expected top-15 window, regardless of run order.
function ageOutEverythingExcept(keepFreshIds: readonly string[], olderThan: string) {
  withDatabase((database) => {
    const placeholders = keepFreshIds.map(() => '?').join(', ');
    database
      .prepare(
        `UPDATE container_access SET contents = json_set(contents, '$.lastAccessedAt', ?)
         WHERE workspaceId = ? AND userId = ? AND containerId NOT IN (${placeholders})`
      )
      .run(olderThan, SEED.workspace.id, SEED.user.id, ...keepFreshIds);
  });
}

// The sidebar's Recent section (THOTH-035) lists the RECENT_MAX_LIMIT (15) most-recently-
// accessed pages across the *entire* workspace (root and nested), ordered by `lastAccessedAt`
// desc — not just root-level ones like the paginated root list. Many other e2e specs navigate
// directly into page details (bumping `lastAccessedAt` to "now" via `POST /pages/:id/access`)
// or create brand-new pages (`create-page.spec.ts`), so by the time this spec runs the relative
// order of everything outside `paginationSeed` is no longer reliably what `end-to-end-seed.ts`
// originally assigned. Re-establishing a known-good baseline in `beforeAll` (rather than
// trusting whatever earlier specs left behind) keeps this spec deterministic regardless of run
// order.
test.describe('recent sidebar section and GET /pages?recent filter', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    const baseline = Date.now();
    const keepFreshIds = [
      SEED.pages.root.id,
      SEED.pages.dataSourceHost.id,
      SEED.pages.childOverflowHost.id,
      ...SEED.pages.paginationSeed.map((paginationPage) => paginationPage.id),
    ];
    // Push every other page's `lastAccessedAt` (including any created/opened by earlier specs)
    // well outside the top-15 window before setting the ones this spec actually cares about.
    ageOutEverythingExcept(keepFreshIds, new Date(baseline - 1_000_000).toISOString());

    setLastAccessedAt(SEED.pages.root.id, new Date(baseline + 5000).toISOString());
    setLastAccessedAt(SEED.pages.dataSourceHost.id, new Date(baseline + 4000).toISOString());
    setLastAccessedAt(SEED.pages.childOverflowHost.id, new Date(baseline + 3000).toISOString());
    for (const [index, paginationPage] of SEED.pages.paginationSeed.entries()) {
      setLastAccessedAt(paginationPage.id, new Date(baseline - index * 1000).toISOString());
    }
  });

  test('renders the most-recently-accessed pages ordered by lastAccessedAt desc', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);

    const recentTree = page.getByTestId('recent-tree');
    await expect(recentTree).toBeVisible();

    // Every entry that should be present, in the exact expected rank order.
    const expectedNamesInOrder = [
      SEED.pages.root.name,
      SEED.pages.dataSourceHost.name,
      SEED.pages.childOverflowHost.name,
      ...SEED.pages.paginationSeed.slice(0, 12).map((seedPage) => seedPage.name),
    ];

    for (const name of expectedNamesInOrder) {
      await expect(recentTree.getByText(name)).toBeVisible();
    }

    // Pagination pages beyond the top-15 window must not appear.
    await expect(recentTree.getByText(SEED.pages.paginationSeed[12]!.name)).toHaveCount(0);
    await expect(recentTree.getByText(SEED.pages.paginationSeed.at(-1)!.name)).toHaveCount(0);

    // Assert rank order via DOM order (not pixel position) — bounding-box `y` comparisons are
    // sensitive to in-flight Collapse animations/transitions and can be flaky under load, whereas
    // the order links appear in the accessibility tree directly reflects render order.
    const linkNames = await recentTree.getByRole('link').allInnerTexts();
    const rankedIndexes = expectedNamesInOrder.map((name) =>
      linkNames.findIndex((linkName) => linkName.includes(name))
    );
    for (const rankedIndex of rankedIndexes) {
      expect(rankedIndex).toBeGreaterThanOrEqual(0);
    }
    for (let index = 1; index < rankedIndexes.length; index++) {
      expect(rankedIndexes[index]).toBeGreaterThan(rankedIndexes[index - 1]!);
    }
  });

  test('opening a page bumps it to the top of Recent', async ({ page }) => {
    // Use the least-recently-accessed pagination page (well outside the top-15 window) so this
    // test's bump doesn't shift which pagination pages appear in the previous test's assertions.
    const lowerRankedPage = SEED.pages.paginationSeed.at(-1)!;
    const originalLastAccessedAt = getLastAccessedAt(lowerRankedPage.id);

    try {
      // Register the response listener before navigating — `POST /pages/:id/access` fires from
      // a `useEffect` on mount and can resolve before a listener set up after `page.goto()`
      // settles would ever see it, causing a hang.
      const accessResponsePromise = page.waitForResponse(
        (response) => response.url().includes(`/pages/${lowerRankedPage.id}/access`) && response.ok()
      );
      await page.goto(`/${SEED.workspace.slug}/pages/${lowerRankedPage.id}`);
      await expect(page.getByRole('heading', { name: lowerRankedPage.name })).toBeVisible();
      await accessResponsePromise;

      // Reload (rather than navigating to the bare `/pages` landing route) remounts the sidebar,
      // forcing a fresh fetch of `GET /pages?recent=true` rather than relying on stale SWR cache
      // — without re-triggering a redirect through `/pages`, which always lands on the most
      // recently *updated* root page (`SEED.pages.root` here) and would re-fire its own
      // `POST /pages/:id/access` on mount, overwriting the very ordering this assertion checks.
      await page.reload();

      const recentTree = page.getByTestId('recent-tree');
      await expect(recentTree.getByText(lowerRankedPage.name)).toBeVisible();

      // The sidebar list is fetched asynchronously after reload, so poll until the refreshed
      // order reflects the newly-accessed page's higher rank.
      await expect
        .poll(async () => {
          const linkNames = await recentTree.getByRole('link').allInnerTexts();
          const bumpedIndex = linkNames.findIndex((linkName) => linkName.includes(lowerRankedPage.name));
          const rootIndex = linkNames.findIndex((linkName) => linkName.includes(SEED.pages.root.name));

          return bumpedIndex !== -1 && rootIndex !== -1 && bumpedIndex < rootIndex;
        })
        .toBe(true);
    } finally {
      setLastAccessedAt(lowerRankedPage.id, originalLastAccessedAt);
    }
  });

  test('Recent is scoped to the current workspace', async ({ page }) => {
    await page.goto(`/${SEED.secondWorkspace.slug}/pages`);

    const recentTree = page.getByTestId('recent-tree');
    await expect(recentTree).toBeVisible();
    await expect(recentTree.getByText(SEED.secondWorkspace.rootPage.name)).toBeVisible();

    // Pages belonging to the primary workspace must never leak into the second workspace's
    // Recent section.
    await expect(recentTree.getByText(SEED.pages.root.name)).toHaveCount(0);
  });

  test('the Recent section collapses and expands via its chevron toggle', async ({ page }) => {
    await page.goto(`/${SEED.workspace.slug}/pages`);

    const recentTree = page.getByTestId('recent-tree');
    await expect(recentTree).toBeVisible();

    const collapseButton = page.getByRole('button', { name: 'Collapse recent' });
    await expect(collapseButton).toBeVisible();
    await collapseButton.click();

    await expect(page.getByRole('button', { name: 'Expand recent' })).toBeVisible();
    await expect(page.getByTestId('recent-tree')).toHaveCount(0);

    await page.getByRole('button', { name: 'Expand recent' }).click();
    await expect(page.getByRole('button', { name: 'Collapse recent' })).toBeVisible();
    await expect(page.getByTestId('recent-tree')).toBeVisible();
  });

  test('GET /pages?recent=true satisfies the "one selector required" validation on its own', async ({ page }) => {
    const response = await page.request.get('/api/v1/pages?recent=true');
    expect(response.ok()).toBe(true);
  });

  test('GET /pages still requires at least one selector', async ({ page }) => {
    const response = await page.request.get('/api/v1/pages');
    expect(response.status()).toBe(400);
  });

  test('GET /pages?recent=true is capped at RECENT_MAX_LIMIT even with a higher limit', async ({ page }) => {
    const response = await page.request.get(`/api/v1/pages?recent=true&workspaceId=${SEED.workspace.id}&limit=50`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(15);
  });

  test('GET /pages?recent=true returns entries sorted by lastAccessedAt desc, each with a lastAccessedAt field', async ({
    page,
  }) => {
    const response = await page.request.get(`/api/v1/pages?recent=true&workspaceId=${SEED.workspace.id}`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    const entries = body.data as { page: { id: string }; lastAccessedAt?: string }[];

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.lastAccessedAt).toBeTruthy();
    }

    const timestamps = entries.map((entry) => Date.parse(entry.lastAccessedAt!));
    for (let index = 1; index < timestamps.length; index++) {
      expect(timestamps[index]).toBeLessThanOrEqual(timestamps[index - 1]!);
    }
  });
});
