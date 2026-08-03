// scripts/set-page-favorites-for-tests.ts
//
// Test-only helper invoked by the favorites-overflow e2e spec to bulk-star/unstar a pool of
// pages by writing directly to `ContainerAccess` (bypassing `PUT /pages/:id/favorite`). The
// real endpoint intentionally bumps `lastAccessedAt` on starring (see the ticket's product
// decision), which would otherwise disturb the seeded `lastAccessedAt` ordering the root-list
// pagination e2e specs depend on if 50+ pages were starred/unstarred through the real API in a
// single test run. This script sets `starred`/`starredAt` only, leaving `lastAccessedAt`
// untouched.
//
// Usage: pnpm tsx --env-file=.env.test scripts/set-page-favorites-for-tests.ts <true|false> <pageId...>
import 'dotenv/config';
import { getContainerAccessRepository } from '../src/lib/database/index.js';
import { SEED } from '../tests/fixtures/seed.js';

const [starredFlag, ...pageIds] = process.argv.slice(2);

if (starredFlag !== 'true' && starredFlag !== 'false') {
  throw new Error('First argument must be "true" or "false"');
}

const starred = starredFlag === 'true';
const containerAccessRepository = await getContainerAccessRepository();

for (const pageId of pageIds) {
  const existing = await containerAccessRepository.getOneByQuery(
    containerAccessRepository.createQuery().eq('containerId', pageId).eq('userId', SEED.user.id)
  );

  if (!existing) {
    continue;
  }

  await containerAccessRepository.update({
    ...existing,
    starred,
    starredAt: starred ? new Date().toISOString() : null,
  });
}

console.log(`✅  Set starred=${starred} for ${pageIds.length} page(s)`);
