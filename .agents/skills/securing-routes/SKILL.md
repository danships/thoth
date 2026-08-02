---
name: securing-routes
description: Use when implementing or reviewing API route security in the Thoth project. Covers session enforcement, per-user data scoping, and the correct use of auth helpers and error types.
---

## Session Enforcement (Automatic)

The `apiRoute` wrapper calls `getSession()` before the handler runs. If no valid session exists, it throws `NotAuthorizedError` which maps to HTTP 401. **You never need to check `session` for null inside a handler** — it is always present and typed as `{ user: User }`.

```typescript
// session is guaranteed non-null inside apiRoute handlers
export const GET = apiRoute<MyResponse, {}, {}, {}>(
  {},
  async (_req, session) => {
    const userId = session.user.id; // always safe
  }
);
```

## Content vs. Per-User State Scoping (THOTH-042)

Thoth distinguishes two categories of data, scoped differently:

- **CONTENT** (`Container` pages/data-sources, `DataView`) — scoped by **workspace membership +
  grant**, never by creator. Any workspace member may read/write another member's content,
  subject to their `AccessGrant` (`permission` + `scopeType`). `userId` on these rows is
  attribution/provenance only — **never** a gate.
- **PER-USER STATE** (`ContainerAccess` — starred/last-accessed) — legitimately scoped by
  `userId` via `addUserIdToQuery`. This did not change.

## Gating Content: `assertContentAccess`

The single chokepoint for content access is `assertContentAccess` (`src/lib/api/server/workspace-access.ts`).
It (1) asserts workspace membership via `assertWorkspaceAccess`, (2) resolves the caller's
`AccessGrant` (a human member via `memberToAccessGrant`, or an App via `session.appContext.accessGrant`),
(3) enforces read scope with `assertGrantAllowsContainer`, and (4) enforces write permission with
`assertGrantAllowsWrite` when `{ mutating: true }` is passed. It throws `NotFoundError` (404) for
non-members (existence-hiding) and `ForbiddenError` (403) for out-of-scope containers or read-only
grants attempting a mutation.

```typescript
import { assertContentAccess } from '@/lib/api/server/workspace-access';

// Fetch content WITHOUT a userId gate — membership + grant do the gating.
const page = await pageRetriever.retrievePage(params.id, session.user.id);
await assertContentAccess(session, page, { mutating: true }); // mutating for POST/PATCH/DELETE
```

For list/tree routes, use `filterContainersByGrantForSession(session, containers)` after scoping
the query with `addWorkspaceIdToQuery` — this applies the same member/App grant to filter the
result set.

```typescript
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { filterContainersByGrantForSession } from '@/lib/auth/access-grant';

// content is scoped by workspace membership + grant, not creator (THOTH-042)
const pages = await repository.getByQuery(
  addWorkspaceIdToQuery(repository.createQuery(), workspace.id)
);
const scopedPages = await filterContainersByGrantForSession(session, pages);
```

## Per-User Data Scoping

**Per-user state** (e.g. `ContainerAccess` starred/last-accessed) must still be scoped with
`addUserIdToQuery` — this is Category B and is unaffected by THOTH-042.

```typescript
import { addUserIdToQuery } from '@/lib/database/helpers';

const containerAccessRepository = await getContainerAccessRepository();

// CORRECT: per-user state scoped to the current user
const starred = await containerAccessRepository.getByQuery(
  addUserIdToQuery(containerAccessRepository.createQuery().eq('starred', true), session.user.id)
);
```

`addUserIdToQuery` must **never** be used to gate content rows (`Container`, `DataView`) — see the
JSDoc on `addUserIdToQuery` in `src/lib/database/helpers.ts`.

## Verifying Resource Access (Content)

When a route operates on a specific content resource (e.g., `PATCH /pages/:id`), fetch it by `id`
with **no owner gate**, then assert the fetched row's own `workspaceId` is accessible:

```typescript
// Fetch by id (no userId gate) — content is scoped by workspace membership + grant (THOTH-042)
const page = await pageRetriever.retrievePage(params.id, session.user.id); // asserts membership internally
await assertContentAccess(session, page, { mutating: true }); // asserts grant permits this write
```

Never expose whether a resource exists to a non-member — `assertWorkspaceAccess`/`assertContentAccess`
return 404, not 403, for non-members. `ForbiddenError` (403) is reserved for members who lack
sufficient grant scope/permission on a resource they can otherwise see exists.

## Error Types

Use the typed error classes from `src/lib/errors/`. The `apiRoute` wrapper catches them and maps to the correct HTTP status code.

```typescript
import { BadRequestError } from '@/lib/errors/bad-request-error';      // 400, visibleError=true
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error'; // 401, visibleError=true
import { NotFoundError } from '@/lib/errors/not-found-error';           // 404, visibleError=true
import { HttpError } from '@/lib/errors/http-error';                    // base class, any code

// visibleError=true → the message is sent to the client
// visibleError=false (default HttpError) → "Something went wrong" is sent, real message is logged
throw new BadRequestError('parentId must be a valid UUID');
throw new NotFoundError('Page not found or access denied');
throw new HttpError('Specific internal detail', 422, false); // never shown to client
```

## Manual Session Check (Server Components / Outside apiRoute)

For server components or utility functions that run outside an API route, call `getSession()` directly:

```typescript
import { getSession } from '@/lib/auth/session';

// Throws NotAuthorizedError (→ 401) if no session exists
const session = await getSession();
```

## Security Checklist

Before merging a new or modified route, verify:

- [ ] Route uses the `apiRoute` wrapper (no raw `NextResponse` handler)
- [ ] Content reads/writes are routed through `assertContentAccess` (membership via
      `assertWorkspaceAccess` + unified `AccessGrant`), not a `userId` gate on the content row
- [ ] List/tree routes scope by `addWorkspaceIdToQuery` and filter with
      `filterContainersByGrantForSession`
- [ ] Mutations call `assertContentAccess(session, row, { mutating: true })` so member/App write
      permission is enforced
- [ ] Per-user state (`ContainerAccess`) stays scoped with `addUserIdToQuery`
- [ ] Not-found responses return 404 (not 403) to avoid resource enumeration
- [ ] No sensitive data (tokens, passwords, internal IDs) is returned in responses
- [ ] `visibleError` is `false` for errors that contain internal implementation details
