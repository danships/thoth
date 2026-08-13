---
name: pnpm-workflow
description: Use when running scripts, installing packages, or managing dependencies in the Thoth project. Covers pnpm commands, workspace setup, and all available npm scripts.
---

## Package Manager

Thoth uses **pnpm** (v10+) exclusively. Never use `npm` or `yarn`.

```bash
pnpm install          # install all dependencies
pnpm add <pkg>        # add a runtime dependency
pnpm add -D <pkg>     # add a dev dependency
pnpm remove <pkg>     # remove a dependency
```

## Available Scripts

Run all scripts from the repository root (the directory containing `package.json`).

| Script | Command | Purpose |
|--------|---------|---------|
| Dev server | `pnpm dev` | Migrate → start `@thoth/jobs` → wait for ready → start Next.js with Turbopack (hot-reload) |
| Dev server (web only) | `pnpm dev:web` | Start only `next dev` |
| Dev server (jobs only) | `pnpm dev:jobs` | Start only `@thoth/jobs` (`tsx watch`) |
| Build | `pnpm build` | Production build of `@thoth/jobs` and `apps/web` (`next build --turbopack`) |
| Start | `pnpm start` | Migrate once, then run PM2 (`thoth-web` + `thoth-jobs`) |
| Lint (all) | `pnpm lint` | Run ESLint + Prettier + TypeScript checks concurrently across every package (root scripts, `apps/web`, `apps/jobs`, `packages/*`) |
| ESLint only | `pnpm lint:eslint` | ESLint on `.ts`/`.tsx` files |
| Prettier check | `pnpm lint:prettier` | Check formatting in `apps/web/src/` |
| TypeScript check | `pnpm lint:tsc` | `tsc --noEmit` — no compiled output, only type errors |
| Format | `pnpm format` | Auto-fix Prettier and ESLint in `apps/web/src/` |
| Test (all) | `pnpm test` | Unit + integration tests across every package that defines them |
| E2E tests | `pnpm test:e2e` | Playwright end-to-end tests |
| Migrate database | `pnpm db:migrate` | Standalone `@thoth/database` migration CLI — never run automatically by the running app/jobs process |
| Generate auth schema | `pnpm better-auth:generate` | Regenerate `schema.sql` from auth config |
| Clear auth | `pnpm scripts:clear-auth` | Dev utility to wipe auth data |
| Manual maintenance purge | `pnpm workspaces:purge` / `pnpm pages:purge` / `pnpm files:purge` | Thin CLI wrappers over the same `@thoth/database` maintenance primitives the scheduled `@thoth/jobs` handlers use. Require `DB` to already be set — never auto-migrate or guess a default connection string. `files:purge` defaults `STORAGE_TYPE`/`STORAGE_LOCAL_FOLDER` to `local`/`./data/uploads` (same defaults as `apps/web`'s) if unset; set them explicitly for a non-default storage backend. See `docs/JOBS_AND_MAINTENANCE.md` at the repo root. |

## Quality Gate Workflow

Before committing or opening a PR always run:

```bash
pnpm lint        # catches ESLint, Prettier, and TypeScript errors across every package
pnpm test        # unit + integration tests across every package
pnpm test:e2e    # Playwright end-to-end tests
pnpm build       # ensures apps/web and @thoth/jobs compile without errors
```

Fix TypeScript errors with `pnpm lint:tsc` first — they are the most blocking. Changes to
`apps/jobs` or `packages/database`'s maintenance primitives (`packages/database/src/services/maintenance/`)
should re-run the full suite for both packages, since the scheduled maintenance handlers and the
manual `*:purge` CLI wrappers share the exact same underlying code.

## Workspace Structure

The root `pnpm-workspace.yaml` defines workspace packages: `apps/web` (Next.js app), `apps/jobs`
(`@thoth/jobs`, the background job runtime), and `packages/*` (`@thoth/database`, `@thoth/storage`,
`@thoth/job-protocol`, `@thoth/shared` — shared, auth-free libraries consumed by both apps). Root
`package.json` scripts fan out to these via `pnpm --filter <pkg> ...` / `pnpm run build:packages`.

## Environment Variables

`apps/web` validates its env vars at startup via `apps/web/src/lib/environment.ts` (using
`envalid`); `apps/jobs` has its own, separate schema in `apps/jobs/src/environment.ts` — it never
reads `apps/web`'s validator, but both must agree on shared values (`DB`, `STORAGE_TYPE`/
`STORAGE_LOCAL_FOLDER`, and the workspace/page/file grace-period variables) in any real
deployment. See the root `README.md`'s "Environment variables" section for the full, authoritative
list and defaults, and `.env.example` for a ready-to-copy starting point.
