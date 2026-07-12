---
name: zod-types-schemas
description: Use when defining API request/response types, Zod validation schemas, or TypeScript types for endpoints in the Thoth project. Covers schema patterns, file organisation, and the DataWrapper utility type.
---

## File Organisation

Each endpoint gets its own file under `src/types/api/endpoints/`:

```
src/types/api/
├── endpoints/
│   ├── create-page.ts         # POST /pages
│   ├── get-pages.ts           # GET  /pages
│   ├── get-page-details.ts    # GET  /pages/:id
│   ├── update-page.ts         # PATCH /pages/:id
│   └── ...
├── entities.ts                # Shared entity schemas (reused across endpoints)
├── utilities.ts               # DataWrapper<T> and other utility types
└── index.ts                   # Re-exports everything
```

Always re-export new schemas and types from `src/types/api/index.ts`.

## Naming Conventions

| What | Pattern | Example |
|------|---------|---------|
| Query schema | `get<Resource>QuerySchema` | `getPagesQuerySchema` |
| Query type | `Get<Resource>Query` | `GetPagesQuery` |
| Body schema | `create<Resource>BodySchema` | `createPageBodySchema` |
| Body type | `Create<Resource>Body` | `CreatePageBody` |
| Response schema | `get<Resource>ResponseSchema` | `getPagesResponseSchema` |
| Response type | `Get<Resource>Response` | `GetPagesResponse` |
| Params schema | `get<Resource>ParametersSchema` | `getPageDetailsParametersSchema` |
| Params type | `Get<Resource>Parameters` | `GetPageDetailsParameters` |

## Defining Schemas

```typescript
import { z } from 'zod';
import type { DataWrapper } from '../utilities';

// URL path parameters (e.g., /pages/:id)
export const getPageDetailsParametersSchema = z.object({
  id: z.string().min(1),
});

// Query string parameters
export const getPageDetailsQuerySchema = z.object({
  includeBlocks: z.coerce.boolean().optional(),
  includeValues: z.coerce.boolean().optional(),
});

// Request body (POST / PATCH)
export const createPageBodySchema = z.object({
  name: z.string().min(1).max(255),
  emoji: z.string().emoji().optional().nullable(),
  parentId: z.string().min(1).optional().nullable(),
});

// Infer TypeScript types from schemas — never write the type manually
export type GetPageDetailsParameters = z.infer<typeof getPageDetailsParametersSchema>;
export type GetPageDetailsQuery = z.infer<typeof getPageDetailsQuerySchema>;
export type CreatePageBody = z.infer<typeof createPageBodySchema>;
```

## Response Types

Response types describe the raw return value of the handler (before the wrapper adds `{ data: ... }`).

```typescript
// Simple object response
export type GetPageDetailsResponse = {
  page: {
    id: string;
    name: string;
    emoji: string | null;
    parentId: string | null;
    createdAt: string;
    lastUpdated: string;
  };
  views?: DataView[];
  blocks?: Block[];
};

// Array response
export type GetPagesResponse = Array<{
  page: { id: string; name: string };
  values?: Record<string, unknown>;
}>;
```

On the client side, the actual Axios response shape is `DataWrapper<T>` where:

```typescript
// src/types/api/utilities.ts
export type DataWrapper<T> = { data: T };
```

## Reusing Entity Schemas

When an entity schema already exists (e.g., `pageSchema` from `src/types/api/entities.ts`), use `.pick()`, `.omit()`, or `.extend()` instead of redefining fields:

```typescript
import { pageSchema } from '../entities';

export const createPageBodySchema = pageSchema.pick({
  name: true,
  emoji: true,
  parentId: true,
});
```

## TypeScript Rules

- Always use `type` aliases, never `interface`.
- Derive TypeScript types from Zod schemas using `z.infer<typeof schema>`.
- Never duplicate type definitions — if a Zod schema exists, infer the type from it.
- For optional fields in responses use `field?: Type` not `field: Type | undefined`.
- For nullable fields use `field: Type | null` (not `undefined`).
