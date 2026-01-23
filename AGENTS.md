# AI Agent Instructions for Thoth

This file contains the instructions for AI agents working on the Thoth codebase.

## Project Overview

Thoth is a Next.js 15 application using React 19, Mantine UI 8, and TypeScript. It's managed with pnpm.

**Tech Stack:**

- Next.js 15 with App Router
- React 19
- Mantine UI 8
- TypeScript
- pnpm

**Architecture:**

- Atomic Design Methodology for UI components
- App Router for routing
- API routes in `src/app/api/`
- Use TypeScript types over interfaces

## Creating API Routes

API routes follow this pattern:

### 1. Type Definitions (`src/types/`)

Create Zod schemas for request/response validation:

```typescript
import { z } from 'zod';

export const getPagesTreeQuerySchema = z.object({
  parentId: z.string().min(1).optional(),
});

export const getPagesTreeResponseSchema = z.object({
  branches: z.array(
    z.object({
      page: z.object({
        id: z.string(),
        title: z.string(),
      }),
    })
  ),
});

export type GetPagesTreeQuery = z.infer<typeof getPagesTreeQuerySchema>;
export type GetPagesTreeResponse = z.infer<typeof getPagesTreeResponseSchema>;
```

### 2. Route Implementation (`src/app/api/{route}/route.ts`)

Use the `apiRoute` wrapper with typed parameters:

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

    const containers = (await containerRepository.getByQuery(databaseQuery)).filter(
      (container) => query?.parentId || !container.parentId
    );

    return {
      branches: containers.map((container) => ({
        page: {
          id: container.id,
          name: container.name,
        },
      })),
    };
  }
);
```

### API Route Structure

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

### Key Points for API Routes

- Use Zod schemas for request/response validation
- Implement proper error handling with appropriate HTTP status codes
- Integrate with authentication system (better-auth)
- Use NextRequest/NextResponse objects
- Export functions named after HTTP methods (GET, POST, PUT, DELETE, etc.)

## React/TSX Component Guidelines

### Styling

- Always use CSS modules (`.module.css` files) for component-specific styles
- Never use inline `<style>` tags
- Name CSS module files after their component: `component-name.module.css` for `component-name.tsx`

### Error Handling

- Never use `console.log()`, `console.error()`, or `console.warn()` for user-facing errors
- Always use the notification system via `useNotification()` hook from `@/lib/hooks/use-notification.tsx`
- The hook provides: `showError`, `showSuccess`, `showWarning`, `showInfo`
- Notifications auto-display in top-right corner and dismiss after 5 seconds
- Usage: `showError(message: string, title?: string)`
- For child components: pass an `onError` callback prop to the parent, which handles the notification
- Error notifications should be triggered in parent components, not where errors occur

## General TypeScript Rules

- Use types instead of interfaces: `type MyType = { ... }` over `interface MyType { ... }`
- All API endpoints should have typed request/response schemas
- Use Zod for runtime validation

## File Structure

```
src/
├── app/                      # Next.js App Router
│   ├── api/                 # API routes
│   └── (routes)/            # Page routes
├── components/
│   ├── atoms/               # Atomic Design: atoms
│   ├── molecules/           # Atomic Design: molecules
│   ├── organisms/           # Atomic Design: organisms
│   └── templates/           # Atomic Design: templates
├── lib/
│   ├── hooks/              # Custom React hooks
│   ├── database/           # Database entities and repositories
│   └── auth.ts             # Authentication utilities
└── types/                   # TypeScript type definitions
```

## Testing & Quality

Before completing tasks, run available lint and typecheck commands:

- Check package.json for scripts like `npm run lint`, `npm run typecheck`, `npm run test`
- Fix any issues found
- Only commit changes when explicitly requested by the user
