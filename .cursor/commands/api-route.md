# Next.js API Route Creation Guide

This document outlines the pattern for creating new API routes in the Thoth Next.js application.

## Overview

API routes in Thoth follow Next.js App Router conventions with these main components:

1. **Type definitions** in `src/types/`
2. **Route implementation** in `src/app/api/{route}/route.ts`
3. **Request/Response handling** using Next.js Request/Response objects

## 1. Type Definitions (`src/types/`)

Create type definitions for your API endpoint:

```typescript
import { z } from 'zod';

// Define request schema
export const getPagesTreeQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
});

export const getPagesTreeResponseSchema = z.object({
  branches: z.array(
    z.object({
      page: z.object({
        id: z.string(),
        title: z.string(),
        // ... other page fields
      }),
      children: z.array(
        z.object({
          page: z.object({
            id: z.string(),
            title: z.string(),
            // ... other page fields
          }),
        })
      ),
    })
  ),
});

// Export types
export type GetPagesTreeQuery = z.infer<typeof getPagesTreeQuerySchema>;
export type GetPagesTreeResponse = z.infer<typeof getPagesTreeResponseSchema>;
```

## 2. Route Implementation (`src/app/api/{route}/route.ts`)

Create the route handler the route-wrapper:

```typescript
export const GET = apiRoute<GetPagesTreeResponse, GetPagesTreeQueryVariables, {}>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
  },
  async ({ query }, session) => {
    const containerRepository = await getContainerRepository();
    const databaseQuery = addUserIdToQuery(containerRepository.createQuery(), session.user.id).sort(
      'lastUpdated',
      'desc'
    );

    if (query?.parentId) {
      databaseQuery.eq('parentId', query.parentId);
    }

    // TODO: SuperSave does not return any result if we set parentId to null
    // eslint-disable-next-line unicorn/no-await-expression-member
    const containers = (await containerRepository.getByQuery(databaseQuery)).filter(
      (container) => query?.parentId || !container.parentId
    );

    const parentIds = containers.map((container) => container.id).filter(Boolean);

    const databaseChildren =
      parentIds.length > 0
        ? await containerRepository.getByQuery(
            addUserIdToQuery(containerRepository.createQuery(), session.user.id).in('parentId', parentIds)
          )
        : [];

    return {
      branches: containers.map((container) => ({
        page: {
          id: container.id,
          name: container.name,
          emoji: container.emoji || null,
          type: container.type as 'page',
          lastUpdated: container.lastUpdated,
          createdAt: container.createdAt,
          parentId: container.parentId || null,
        },
        children: databaseChildren
          .filter((child) => child.parentId === container.id)
          .map((child) => ({
            page: {
              id: child.id,
              name: child.name,
              emoji: child.emoji || null,
              type: child.type as 'page',
              lastUpdated: child.lastUpdated,
              createdAt: child.createdAt,
              parentId: child.parentId || null,
            },
          })),
      })),
    };
  }
);
```

## 3. Route Structure

Next.js App Router automatically handles routing based on file structure:

```
src/app/api/
├── pages/
│   └── tree/
│       └── route.ts          # Handles /api/pages/tree
├── users/
│   └── route.ts              # Handles /api/users
└── auth/
    └── login/
        └── route.ts          # Handles /api/auth/login
```

## Key Points

- **Type Safety**: Use Zod schemas for request/response validation
- **Error Handling**: Implement proper error handling with appropriate HTTP status codes
- **Authentication**: Integrate with your auth system (better-auth, etc.)
- **Validation**: Validate both request and response data
- **Next.js Conventions**: Use NextRequest/NextResponse objects
- **HTTP Methods**: Export functions named after HTTP methods (GET, POST, PUT, DELETE, etc.)

## File Structure

```
src/
├── app/api/
│   └── {route}/
│       └── route.ts          # Route implementation
├── types/
│   └── api.ts                # API type definitions
└── lib/
    ├── auth.ts               # Authentication utilities
    └── db.ts                 # Database utilities
```

## Example Usage

The route can be called as:

```
GET /api/pages/tree?parentId=some-id
```

And will return:

```json
{
  "branches": [
    {
      "page": {
        "id": "page-1",
        "title": "Page 1"
      },
      "children": [
        {
          "page": {
            "id": "page-1-1",
            "title": "Child Page"
          }
        }
      ]
    }
  ]
}
```

## Additional Considerations

- **Middleware**: Use Next.js middleware for cross-cutting concerns
- **Rate Limiting**: Implement rate limiting if needed
- **CORS**: Configure CORS headers if serving external clients
- **Caching**: Use Next.js caching strategies for better performance
- **Streaming**: Use streaming responses for large datasets
