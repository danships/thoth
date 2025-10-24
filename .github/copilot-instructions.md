## Thoth — Copilot instructions for AI coding agents

This file gives concise, actionable guidance to help an AI coding agent be immediately productive working on Thoth.

High level

- Monorepo managed with pnpm. The app is a Next.js 15 app using the App Router (src/app). TypeScript, React 19, Mantine UI, and Nanostores are used.
- Backend API routes live under `src/app/api/*` (Next.js route handlers). Front-end code in `src/app` calls those routes through `src/lib/api/client.ts` which uses axios with baseURL `/api/v1`.

Key components and patterns

- Auth: server-side session lookup is used in `src/app/layout.tsx` via `auth.api.getSession`. Client-side auth lives in `src/lib/auth/provider.tsx` and `src/lib/auth/client.ts` (use `useAuth()` to access user/session on client).
- Data layer: simple repository pattern under `src/lib/database` with helper `addUserIdToQuery` for per-user scoping. API route handlers typically call `getWorkspaceRepository()` and `getContainerRepository()`.
- API routes: use `apiRoute` wrapper from `src/lib/api/route-wrapper` which enforces schema validation (Zod) and provides typed session. See `src/app/api/v1/pages/*.ts` for examples (GET, POST, tree endpoints).
- Types & schemas: API shapes and validation live in `src/types/api` and `src/types/schemas`. Prefer reading those files for exact shapes when adding or changing endpoints.
- Front-end store: Nanostores + a `createFetcherStore` helper (`src/lib/store/fetcher.ts`) are used for data fetching. Example stores: `$rootPagesTree` and `$currentPage` in `src/lib/store/query/`.

Creating a new API route

- Files: add the route handler at `src/app/api/<your-route>/route.ts`. Next.js routes are file-system based; export functions named `GET`, `POST`, etc.
- Types first: create Zod schemas and exported types under `src/types/api` (prefer `src/types/api/endpoints/`) and reuse them in the route via `expectedQuerySchema`/`expectedBodySchema`.
- Use `apiRoute` wrapper: call `apiRoute<Resp, Query, Body>(options, handler)` so the session is typed and schemas are enforced.
- Database access: obtain repositories with `getWorkspaceRepository()`/`getContainerRepository()` from `src/lib/database` and ALWAYS scope queries with `addUserIdToQuery(..., session.user.id)` to avoid leaking data.
- Client surface: after implementing the route, add a typed client helper in `src/lib/api/client.ts` (baseURL is `/api/v1`) so front-end code can call the endpoint consistently.
- Validation & errors: rely on Zod for input validation; throw early (or return appropriate HTTP status from the handler) for auth/validation failures so errors surface in logs.
- Quick checks: run `pnpm lint`, `pnpm lint:tsc` (TypeScript check) and `pnpm build` before opening a PR.

Developer workflows (commands)

- Install: `pnpm install` (pnpm v10+ is expected). Package manager set in root `package.json`.
- Dev: `pnpm dev` (root) runs Next dev with turbopack; you can also `cd src` or root `pnpm dev` as configured. To run only the web app during development, see README but main dev script is `pnpm dev`.
- Build: `pnpm build` (runs `next build --turbopack`).
- Lint/format: `pnpm lint`, `pnpm format`. ESLint, Prettier, and tsc checks exist (`lint:eslint`, `lint:prettier`, `lint:tsc`).

Conventions & gotchas

- Routes only live under `src/app/api/*` (Next App Router route handlers). When adding an endpoint, update `src/lib/api/client.ts` for a typed client method.
- Use types from `src/types/api` for API input/output. API route handlers validate inputs via Zod schemas exported alongside the types.
- Database queries must be scoped by user using `addUserIdToQuery(...)` to avoid leaking data across users — most API routes rely on this pattern.
- The repo uses `better-auth` and an OIDC flow. Secrets are expected via env variables validated in `src/lib/environment.ts` (envalid). When running locally, provide env vars (e.g., `BETTER_AUTH_SECRET`, `OIDC_*`).
- Prefers `type` aliases over `interface` (see `.cursor/rules/basics.mdc`). Follow existing file style (strict TypeScript settings in package.json devDeps).

Where to look first (quick navigation)

- Application shell & session: `src/app/layout.tsx`, `src/app/layout-client.tsx`, `src/lib/auth/provider.tsx`
- API client: `src/lib/api/client.ts`
- API route wrapper & examples: `src/lib/api/route-wrapper.ts`, `src/app/api/v1/pages/route.ts`, `src/app/api/v1/pages/tree/route.ts`, `src/app/api/v1/pages/[id]/route.ts`
- Database repositories & helpers: `src/lib/database/*` and `src/lib/database/helpers.ts`
- Types & schemas: `src/types/api/*` and `src/types/schemas/*`
- Stores & data hooks: `src/lib/store/*` (see `createFetcherStore` usage)

Examples to copy/paste

- Create a typed API client call (follow `src/lib/api/client.ts`):
  - pages.create({ name, emoji, parentId }) -> POST `/api/v1/pages`
- Validate server route input with `apiRoute` and zod schema exported from `src/types/api` (see `src/app/api/v1/pages/route.ts`).

Quality gates

- Run `pnpm build` and `pnpm lint` after making significant changes. Fix TypeScript errors (`pnpm lint:tsc`) before opening PRs.

If uncertain

- Check `src/types/api` and corresponding route under `src/app/api/v1/*` to infer exact JSON shape and validation. Read `src/lib/database` to understand repository methods and required scoping.
