---
name: api-route-definition
description: Use when creating or modifying API route handlers in the Thoth project. Covers the apiRoute wrapper, file placement, HTTP method exports, error handling, and the client helper pattern.
---

## File Placement

All versioned API routes live under `apps/web/src/app/api/v1/<resource>/route.ts`. Next.js App Router maps the file path to the URL:

```text
apps/web/src/app/api/v1/pages/route.ts              → GET/POST  /api/v1/pages
apps/web/src/app/api/v1/pages/[id]/route.ts         → GET/PATCH  /api/v1/pages/:id
apps/web/src/app/api/v1/pages/[id]/blocks/route.ts  → GET/POST  /api/v1/pages/:id/blocks
```

Auth routes are handled by `better-auth` at `apps/web/src/app/api/auth/[...auth]/route.ts` — do not add custom routes there.

## The `apiRoute` Wrapper

Always use the `apiRoute` wrapper from `@/lib/api/route-wrapper`. It handles:
- Session enforcement (unauthenticated requests get 401 automatically)
- Zod schema validation for body, query params, and URL params
- JSON serialisation of the response (wraps result in `{ data: result }`)
- Centralised error handling and logging

```typescript
import { apiRoute } from '@/lib/api/route-wrapper';
import type { MyResponse, MyQuery, MyParams, MyBody } from '@/types/api';
import { myQuerySchema, myParamsSchema, myBodySchema } from '@/types/api';

// Type params: <ResponseType, QueryType, ParamsType, BodyType>
export const GET = apiRoute<MyResponse, MyQuery, MyParams, {}>(
  {
    expectedQuerySchema: myQuerySchema,
    expectedParamsSchema: myParamsSchema,
  },
  async ({ query, params }, session) => {
    // session.user.id is always available here
    // ...
    return result; // automatically wrapped in { data: result }
  }
);

export const POST = apiRoute<MyResponse, {}, {}, MyBody>(
  {
    expectedBodySchema: myBodySchema,
  },
  async ({ body }, session) => {
    // body is fully typed and validated
    return result;
  }
);
```

## Response Behaviour

| Return value | HTTP status | Body |
|---|---|---|
| An object/array | 200 | `{ data: <value> }` |
| `undefined` / `void` | 204 | empty |

## Error Handling

Throw typed errors from `apps/web/src/lib/errors/` — the wrapper catches them and returns the correct status code.

```typescript
import { BadRequestError } from '@/lib/errors/bad-request-error';      // 400
import { NotAuthorizedError } from '@/lib/errors/not-authorized-error'; // 401
import { NotFoundError } from '@/lib/errors/not-found-error';           // 404
import { HttpError } from '@/lib/errors/http-error';                    // any code

throw new BadRequestError('parentId is required');
throw new NotFoundError('Page not found');
throw new HttpError('Custom message', 422, true); // visibleError=true sends message to client
```

When `visibleError` is `false` (the default for `HttpError`), the client receives `"Something went wrong"` while the real message is logged server-side.

## Adding a Client Helper

After adding a route, expose it through `apps/web/src/lib/api/client.ts` so front-end code has a single, typed entry point:

```typescript
// apps/web/src/lib/api/client.ts
export const api = {
  myResource: {
    list: (params?: MyQuery) => apiClient.get<DataWrapper<MyResponse[]>>('/my-resource', { params }),
    get: (id: string) => apiClient.get<DataWrapper<MyResponse>>(`/my-resource/${id}`),
    create: (body: MyBody) => apiClient.post<DataWrapper<MyResponse>>('/my-resource', body),
    update: (id: string, body: Partial<MyBody>) => apiClient.patch<DataWrapper<MyResponse>>(`/my-resource/${id}`, body),
    delete: (id: string) => apiClient.delete(`/my-resource/${id}`),
  },
};
```

`apiClient` is an `axios` instance with `baseURL: '/api/v1'` already configured.

## Checklist for a New Route

1. Create `apps/web/src/app/api/v1/<resource>/route.ts`
2. Define Zod schemas and TS types in `apps/web/src/types/api/endpoints/<endpoint-name>.ts`
3. Export types from `apps/web/src/types/api/index.ts`
4. Use `apiRoute` wrapper with the correct schema options
5. Scope DB queries per entity category: CONTENT via `addWorkspaceIdToQuery` + `assertContentAccess`/`filterContainersByGrantForSession`; PER-USER STATE via `addUserIdToQuery` (see `securing-routes` skill, THOTH-042)
6. Add a typed helper to `apps/web/src/lib/api/client.ts`
7. Run `pnpm lint` and `pnpm build`
