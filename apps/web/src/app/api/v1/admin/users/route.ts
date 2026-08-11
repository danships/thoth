import { apiRoute } from '@/lib/api/route-wrapper';
import { assertPlatformAdmin } from '@/lib/auth/platform-user';
import { getPlatformUserRepository } from '@/lib/database';
import { getSettingsForSubjects } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { getUserStorageUsage } from '@/lib/files/quota';
import type { AdminUserItem, GetAdminUsersQuery, GetAdminUsersResponse } from '@/types/api';
import { getAdminUsersQuerySchema } from '@/types/api';
import type { PlatformUser } from '@thoth/database/types';

const DEFAULT_LIMIT = 50;

// Stable ordering: earliest-registered first, ties broken by userId. The cursor is the last
// item's `userId`, which is unique, so pagination is deterministic.
function sortUsers(users: PlatformUser[]): PlatformUser[] {
  return users.toSorted((a, b) => {
    if (a.registeredAt !== b.registeredAt) {
      return a.registeredAt < b.registeredAt ? -1 : 1;
    }
    return a.userId < b.userId ? -1 : 1;
  });
}

function matchesSearch(user: PlatformUser, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }
  return (
    user.userId === search.trim() ||
    user.name.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle)
  );
}

export const GET = apiRoute<GetAdminUsersResponse, GetAdminUsersQuery, {}, {}>(
  {
    disallowApiKey: true,
    expectedQuerySchema: getAdminUsersQuerySchema,
  },
  async ({ query }, session) => {
    await assertPlatformAdmin(session);

    const limit = query?.limit ?? DEFAULT_LIMIT;
    const repository = await getPlatformUserRepository();
    const allUsers = await repository.getByQuery(repository.createQuery());

    let filtered = sortUsers(allUsers);
    if (query?.search) {
      filtered = filtered.filter((user) => matchesSearch(user, query.search!));
    }

    // Cursor is the last-seen `userId` — skip everything up to and including it.
    if (query?.cursor) {
      const cursorIndex = filtered.findIndex((user) => user.userId === query.cursor);
      if (cursorIndex !== -1) {
        filtered = filtered.slice(cursorIndex + 1);
      }
    }

    const page = filtered.slice(0, limit);
    const nextCursor = filtered.length > limit ? (page.at(-1)?.userId ?? null) : null;

    const quotas = await getSettingsForSubjects(
      STORAGE_QUOTA_BYTES_KEY,
      'user',
      page.map((user) => user.userId)
    );

    const items: AdminUserItem[] = await Promise.all(
      page.map(async (user) => ({
        id: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        storageQuotaBytes: quotas.get(user.userId) ?? null,
        usedBytes: await getUserStorageUsage(user.userId),
      }))
    );

    return { items, nextCursor };
  }
);
