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

## E2E Tests (Playwright)

Every feature — new or modified — **must** ship with Playwright E2E tests.

- Tests live in `tests/e2e/` grouped by domain (auth, pages, data-sources, data-views, page-values).
- Use seeded data from `tests/e2e/constants.ts` (`SEED.*`) — never hardcode IDs.
- Run: `pnpm test:e2e` (local) · `pnpm test:e2e:ui` (interactive) · `pnpm test:e2e:report` (report).
- See `.agents/commands/e2e-test.md` for full conventions, auth setup, and selector guidance.

## Skills

The following agent skills provide targeted guidance for specific tasks:

| Skill | Path | Purpose |
|-------|------|---------|
| `react-tsx-components` | `.agents/skills/react-tsx-components/SKILL.md` | Styling and error-handling conventions when editing `*.tsx` component files |
| `pnpm-workflow` | `.agents/skills/pnpm-workflow/SKILL.md` | pnpm commands, available scripts, quality-gate workflow, and env-var setup |
| `api-route-definition` | `.agents/skills/api-route-definition/SKILL.md` | Creating API routes with the `apiRoute` wrapper, file placement, HTTP exports, error handling, and the client helper pattern |
| `zod-types-schemas` | `.agents/skills/zod-types-schemas/SKILL.md` | Defining Zod schemas and TypeScript types for API endpoints, naming conventions, and `DataWrapper` usage |
| `securing-routes` | `.agents/skills/securing-routes/SKILL.md` | Session enforcement, per-user data scoping with `addUserIdToQuery`, resource ownership checks, and error types |
| `database-repositories` | `.agents/skills/database-repositories/SKILL.md` | Using SuperSave repositories, query building, entity definitions, retrievers, and migration patterns |
