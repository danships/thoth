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

## Per-User Data Scoping

**Every** database query against user-owned data must be scoped with `addUserIdToQuery`. Forgetting this leaks data across users.

```typescript
import { addUserIdToQuery } from '@/lib/database/helpers';

const repository = await getContainerRepository();

// CORRECT: scoped to the current user
const pages = await repository.getByQuery(
  addUserIdToQuery(repository.createQuery(), session.user.id)
);

// WRONG: returns data for all users
const pages = await repository.getByQuery(repository.createQuery()); // ❌
```

For workspace-scoped data, also chain `addWorkspaceIdToQuery`:

```typescript
import { addUserIdToQuery, addWorkspaceIdToQuery } from '@/lib/database/helpers';

const query = addUserIdToQuery(
  addWorkspaceIdToQuery(repository.createQuery(), workspace.id),
  session.user.id
);
```

## Verifying Resource Ownership

When a route operates on a specific resource (e.g., `PATCH /pages/:id`), always verify the resource belongs to the current user by including the user scope in the fetch query:

```typescript
// Fetch the resource AND enforce ownership in one query
const page = await containerRepository.getOneByQuery(
  addUserIdToQuery(
    containerRepository.createQuery().eq('id', params.id),
    session.user.id
  )
);

if (!page) {
  throw new NotFoundError('Page not found'); // 404 — also hides existence from other users
}
```

Never expose whether a resource exists to an unauthorised user — return 404, not 403.

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
- [ ] All DB queries include `addUserIdToQuery(…, session.user.id)`
- [ ] Resource ownership is validated before any mutation
- [ ] Not-found responses return 404 (not 403) to avoid resource enumeration
- [ ] No sensitive data (tokens, passwords, internal IDs) is returned in responses
- [ ] `visibleError` is `false` for errors that contain internal implementation details
