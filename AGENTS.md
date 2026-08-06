# AI Agent Instructions for Thoth

This file contains the instructions for AI agents working on the Thoth codebase.

## Project Overview

Thoth is a pnpm monorepo. The Next.js 15 application (React 19, Mantine UI 8, TypeScript) lives in
`apps/web`; the repository root is a thin workspace orchestrator whose commands delegate to
`apps/web`. `packages/` is currently empty, reserved for future extracted packages.

**Tech Stack:**

- Next.js 15 with App Router
- React 19
- Mantine UI 8
- TypeScript
- pnpm

**Architecture:**

- Atomic Design Methodology for UI components
- App Router for routing
- API routes in `apps/web/src/app/api/`
- Use TypeScript types over interfaces

## Creating API Routes

API routes follow this pattern:

### 1. Type Definitions (`apps/web/src/types/`)

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

### 2. Route Implementation (`apps/web/src/app/api/{route}/route.ts`)

Use the `apiRoute` wrapper with typed parameters. **Content** (pages, data-sources, DataViews)
is scoped by workspace membership + grant via `assertContentAccess`/`addWorkspaceIdToQuery` —
never by `userId` (creator identity is attribution only, see "Content vs. Per-User State
Scoping" below):

```typescript
export const GET = apiRoute<GetPagesTreeResponse, GetPagesTreeQueryVariables, {}>(
  {
    expectedQuerySchema: getPagesTreeQueryVariablesSchema,
  },
  async ({ query }, session) => {
    const workspaceId = await resolveWorkspaceIdForRequest(query, session.user.id);
    await assertWorkspaceAccess(session.user.id, workspaceId);

    const containerRepository = await getContainerRepository();
    const databaseQuery = addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId).sort(
      'lastUpdated',
      'desc'
    );

    if (query?.parentId) {
      databaseQuery.eq('parentId', query.parentId);
    }

    const containers = await filterContainersByGrantForSession(
      session,
      (await containerRepository.getByQuery(databaseQuery)).filter(
        (container) => query?.parentId || !container.parentId
      )
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
apps/web/src/app/api/
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
- Whenever a route or its API Zod schemas change, update `apps/web/src/lib/openapi/registry.ts`, run `pnpm openapi:generate` (delegates to `pnpm --filter @thoth/web openapi:generate`), and commit the refreshed `apps/web/public/openapi.json` (served statically at `/openapi.json`).
- `pnpm lint` includes `lint:openapi`, which fails if `apps/web/public/openapi.json` drifts from the registry/Zod source of truth.
- The Docker build copies the standalone build's `public` directory into the runtime image, so the committed spec ships automatically.

## General TypeScript Rules

- Use types instead of interfaces: `type MyType = { ... }` over `interface MyType { ... }`
- All API endpoints should have typed request/response schemas
- Use Zod for runtime validation

## Content vs. Per-User State Scoping (THOTH-042)

Thoth's authorization model draws a hard line between two kinds of rows:

- **CONTENT** (`Container` pages/data-sources, `DataView`) — gated by **workspace membership +
  grant**, never by creator identity. `userId` on a content row is attribution/provenance only.
  The canonical chokepoint is `assertContentAccess(session, row, { mutating? })`
  (`apps/web/src/lib/api/server/workspace-access.ts`): it asserts the caller is a member of the row's own
  `workspaceId` (via `assertWorkspaceAccess`, which throws `NotFoundError` — never 403 — for
  non-members, hiding existence), resolves a single `AccessGrant` for the caller (a human member
  via `memberToAccessGrant`, or an App via `session.appContext.accessGrant` — same shape, same
  checks), and enforces read scope (`assertGrantAllowsContainer`) and, for mutations, write
  permission (`assertGrantAllowsWrite`). List/tree routes use the sibling
  `filterContainersByGrantForSession(session, rows)` instead. Build content queries with
  `addWorkspaceIdToQuery(query, workspaceId)`, never `addUserIdToQuery`.

- **PER-USER STATE** (`ContainerAccess` — starred/last-accessed) — stays scoped by `userId` via
  `addUserIdToQuery(query, session.user.id)`. This is the *only* legitimate remaining use of
  `addUserIdToQuery` for anything resembling a workspace resource.

A member/App scoped to `workspace`/`read_write` (the default for every original owner) is
unaffected — `assertGrantAllowsContainer` short-circuits and `assertGrantAllowsWrite` always
passes. The extra enforcement only bites for members explicitly scoped to specific containers or
granted `read`-only.

## File Structure

```
apps/web/src/
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

Before completing tasks, run the relevant quality gates for the scope you changed:

- `pnpm test:unit` — fast Vitest unit tests for isolated logic in `apps/web/src/**/*.test.ts`
- `pnpm test:integration` — Vitest API integration tests against a real HTTP server in `apps/web/tests/integration/api/**/*.test.ts`
- `pnpm test` — combined unit + integration suite
- `pnpm test:e2e` — Playwright browser tests for user-facing flows
- `pnpm lint` — ESLint + Prettier + TypeScript + OpenAPI drift checks
- `pnpm lint:tsc` — TypeScript-only check when you need to focus on compile errors first
- `pnpm build` — required before opening a pull request
- Only commit changes when explicitly requested by the user
- Never add custom patches (e.g. via `pnpm patch`/`patches/*.patch`) to work around a broken
  ESLint rule or dependency incompatibility. Instead, disable the offending rule (or fix the
  root cause via config, e.g. explicit `settings`) in `apps/web/eslint.config.mjs`.

## Playwright E2E Tests

Use Playwright for browser/UI interaction coverage. Prefer unit tests for isolated logic and
`apps/web/tests/integration/api/` for API-only behavior that does not require a browser.

- Tests live in `apps/web/tests/e2e/` grouped by domain (auth, pages, data-sources, data-views, page-values).
- Shared seeded data lives in `apps/web/tests/fixtures/seed.ts` and is re-exported by `apps/web/tests/e2e/constants.ts` (`SEED.*`).
- Run: `pnpm test:e2e` (local) · `pnpm test:e2e:ui` (interactive) · `pnpm test:e2e:report` (report).
- See `.agents/commands/e2e-test.md` for full conventions, auth setup, and selector guidance.

## Skills

The following agent skills provide targeted guidance for specific tasks:

| Skill                   | Path                                            | Purpose                                                                                                                      |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `react-tsx-components`  | `.agents/skills/react-tsx-components/SKILL.md`  | Styling and error-handling conventions when editing `*.tsx` component files                                                  |
| `pnpm-workflow`         | `.agents/skills/pnpm-workflow/SKILL.md`         | pnpm commands, available scripts, quality-gate workflow, and env-var setup                                                   |
| `api-route-definition`  | `.agents/skills/api-route-definition/SKILL.md`  | Creating API routes with the `apiRoute` wrapper, file placement, HTTP exports, error handling, and the client helper pattern |
| `zod-types-schemas`     | `.agents/skills/zod-types-schemas/SKILL.md`     | Defining Zod schemas and TypeScript types for API endpoints, naming conventions, and `DataWrapper` usage                     |
| `securing-routes`       | `.agents/skills/securing-routes/SKILL.md`       | Content access via `assertContentAccess` (membership + unified `AccessGrant`); per-user state (`ContainerAccess`) stays user-scoped              |
| `database-repositories` | `.agents/skills/database-repositories/SKILL.md` | Using SuperSave repositories, query building, entity definitions, retrievers, and migration patterns                         |
