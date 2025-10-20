# API Route Creation Guide

This document outlines the pattern for creating new API routes in the Thoth backend, based on the `get-pages-tree` implementation.

## Overview

API routes in Thoth follow a structured pattern with three main components:

1. **Type definitions** in `packages/types/src/api/endpoints/`
2. **Route implementation** in `packages/backend/src/modules/{module}/api/`
3. **Route registration** in `packages/backend/src/core/api/initialize-http-api.ts`

## 1. Type Definitions (`packages/types/src/api/endpoints/`)

Create a new file for your endpoint (e.g., `get-pages-tree.ts`):

```typescript
import z from "zod";
import { withIdSchema } from "../../schemas/utils.js";
import { pageSchema } from "../entities.js";
import type { DataWrapper } from "../utils.js";

// Define the endpoint path
export const GET_PAGES_TREE_ENDPOINT = "/pages/tree";

// Define response schema
const pagesTreeBranchSchema = z.array(
  z.object({
    page: pageSchema.extend(withIdSchema.shape),
    children: z.array(
      z.object({
        page: pageSchema,
      })
    ),
  })
);

export const getPagesTreeResponseSchema = z.object({
  branches: pagesTreeBranchSchema,
});

// Export types
export type GetPagesTreeResponse = z.infer<typeof getPagesTreeResponseSchema>;
export type GetPagesTreeResponseData = DataWrapper<GetPagesTreeResponse>;

// Define query/body/params schemas
export const getPagesTreeQueryVariablesSchema = z.object({
  parentId: z.string().min(1).optional(),
});
export type GetPagesTreeQueryVariables = z.infer<
  typeof getPagesTreeQueryVariablesSchema
>;
```

Then export from `packages/types/src/api/endpoints/index.ts`:

```typescript
export * from "./get-pages-tree.js";
```

## 2. Route Implementation (`packages/backend/src/modules/{module}/api/`)

Create the route handler using the `apiRoute` wrapper:

```typescript
import {
  type GetPagesTreeQueryVariables,
  type GetPagesTreeResponse,
  getPagesTreeQueryVariablesSchema,
} from "@thoth/types/api";
import { apiRoute } from "../../../core/api/api-route.js";
import { addUserIdToQuery } from "../../database/helpers.js";
import { getContainerRepository } from "../../database/index.js";

export const getPagesTree = apiRoute<
  GetPagesTreeResponse,
  GetPagesTreeQueryVariables
>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
    // expectedBodySchema: getPagesTreeBodySchema, // if needed
    // expectedParamsSchema: getPagesTreeParamsSchema, // if needed
  },
  async ({ query }, session) => {
    // Your route logic here
    const containerRepository = getContainerRepository();
    const dbQuery = addUserIdToQuery(
      containerRepository.createQuery(),
      session.user.id
    ).sort("lastUpdated", "desc");

    if (query?.parentId) {
      dbQuery.eq("parentId", query.parentId);
    }

    const containers = await containerRepository.getByQuery(dbQuery);
    // ... more logic

    return {
      branches: containers.map((container) => ({
        page: container,
        children: [], // your response structure
      })),
    };
  }
);
```

## 3. Route Registration (`packages/backend/src/core/api/initialize-http-api.ts`)

Register your route in the HTTP API router:

```typescript
import { getPagesTree } from "../../modules/containers/api/get-pages-tree.js";

export function initializeHttpApi(): Router {
  const router = express.Router();

  router.use("/api/v1/", middleware, express.json());

  // Register your route
  router.get("/api/v1/pages/tree", getPagesTree);

  return router;
}
```

## Key Points

- **Type Safety**: All input/output types are defined with Zod schemas and TypeScript types
- **Validation**: The `apiRoute` wrapper automatically validates query parameters, body, and params
- **Session Access**: The handler receives a `session` object with the authenticated user
- **Error Handling**: Validation errors are automatically handled and returned as 400 responses
- **Response Format**: All responses are wrapped in `{ data: ... }` format
- **Authentication**: All routes are protected by the auth middleware

## File Structure

```
packages/
├── types/src/api/endpoints/
│   ├── get-pages-tree.ts          # Type definitions
│   └── index.ts                   # Export all endpoints
└── backend/src/
    ├── core/api/
    │   ├── api-route.ts           # Core apiRoute wrapper
    │   └── initialize-http-api.ts # Route registration
    └── modules/{module}/api/
        └── get-pages-tree.ts      # Route implementation
```

## Example Usage

The route can be called as:

```
GET /api/v1/pages/tree?parentId=some-id
```

And will return:

```json
{
  "data": {
    "branches": [
      {
        "page": {
          /* page data */
        },
        "children": [
          {
            "page": {
              /* child page data */
            }
          }
        ]
      }
    ]
  }
}
```
