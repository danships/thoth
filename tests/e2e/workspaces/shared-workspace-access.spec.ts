import { test, expect } from '../fixtures/test';
import { SEED } from '../constants';

// THOTH-042: verifies the unified member `AccessGrant` model — content is gated by workspace
// membership + grant (permission/scopeType), never by creator identity. This spec runs three
// times (see `playwright.config.ts`'s `chromium` / `chromium-second-member` /
// `chromium-readonly-member` projects, each `testMatch`-scoped to this file), once per seeded
// identity, so the same assertions exercise a different `AccessGrant`:
//   - `chromium` (SEED.user): the pre-existing `workspace`/`read_write` owner — behaviour must
//     be byte-for-byte unaffected by the refactor.
//   - `chromium-second-member` (SEED.secondUser): a `workspace`/`read_write` member who never
//     created any seeded content — proves fellow members can read AND write each other's
//     content.
//   - `chromium-readonly-member` (SEED.thirdUser): a `workspace`/`read` member — proves a
//     read-only member can read but not mutate content it doesn't own, and still gets a 404
//     (not a 403) for a workspace it isn't a member of.
test.describe('shared workspace access (THOTH-042)', () => {
  test('a workspace member can read a page created by another member', async ({ request }) => {
    const response = await request.get(`/api/v1/pages/${SEED.sharedAccess.page.id}`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.data.page.id).toBe(SEED.sharedAccess.page.id);
    expect(body.data.page.name).toBe(SEED.sharedAccess.page.name);
  });

  test('a workspace member sees content created by another member in the root tree', async ({ request }) => {
    let cursor: string | undefined;
    let found = false;

    // Root list is paginated (THOTH-042, DECISION 1 changed its ordering to
    // workspace-scoped `Container.lastUpdated`); walk every page rather than assuming the
    // fixture lands within a single response.
    for (let page = 0; page < 20 && !found; page += 1) {
      const response = await request.get('/api/v1/pages/tree', {
        params: { workspaceId: SEED.workspace.id, limit: 100, ...(cursor ? { cursor } : {}) },
      });
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      const ids = (body.data.branches as { page: { id: string } }[]).map((branch) => branch.page.id);
      found = ids.includes(SEED.sharedAccess.page.id);

      if (!body.data.pagination.hasMore) {
        break;
      }
      cursor = body.data.pagination.nextCursor;
    }

    expect(found).toBeTruthy();
  });

  test('mutation permission on another member\'s content follows the caller\'s own grant', async ({
    request,
  }, testInfo) => {
    const response = await request.patch(`/api/v1/pages/${SEED.sharedAccess.page.id}`, {
      data: { emoji: '🔑' },
    });

    if (testInfo.project.name === 'chromium-readonly-member') {
      // Read-only grant: can see the content (asserted above) but not mutate it.
      expect(response.status()).toBe(403);
    } else {
      // Owner and read_write member: mutation succeeds even though neither necessarily created
      // the row (attribution via `userId` is preserved separately, never used as a gate).
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.data.id).toBe(SEED.sharedAccess.page.id);
    }
  });

  test('a workspace member is denied (404, not 403) access to a workspace they are not a member of', async ({
    request,
  }, testInfo) => {
    if (testInfo.project.name === 'chromium') {
      test.skip(true, 'The primary seed user owns secondWorkspace, so this case does not apply to it.');
    }

    const treeResponse = await request.get('/api/v1/pages/tree', {
      params: { workspaceId: SEED.secondWorkspace.id },
    });
    // Existence-hiding: a non-member gets 404, never 403, regardless of read/read_write grant
    // level on their own workspaces.
    expect(treeResponse.status()).toBe(404);

    const pageResponse = await request.get(`/api/v1/pages/${SEED.secondWorkspace.rootPage.id}`);
    expect(pageResponse.status()).toBe(404);
  });
});
