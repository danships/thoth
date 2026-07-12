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

Run all scripts from the repository root (`/workspace`).

| Script | Command | Purpose |
|--------|---------|---------|
| Dev server | `pnpm dev` | Start Next.js with Turbopack (hot-reload) |
| Build | `pnpm build` | Production build via `next build --turbopack` |
| Start | `pnpm start` | Run the production build |
| Lint (all) | `pnpm lint` | Run ESLint + Prettier + TypeScript checks concurrently |
| ESLint only | `pnpm lint:eslint` | ESLint on `.ts`/`.tsx` files |
| Prettier check | `pnpm lint:prettier` | Check formatting in `src/` |
| TypeScript check | `pnpm lint:tsc` | `tsc --noEmit` — no compiled output, only type errors |
| Format | `pnpm format` | Auto-fix Prettier and ESLint in `src/` |
| Generate auth schema | `pnpm better-auth:generate` | Regenerate `schema.sql` from auth config |
| Clear auth | `pnpm scripts:clear-auth` | Dev utility to wipe auth data |

## Quality Gate Workflow

Before committing or opening a PR always run:

```bash
pnpm lint        # catches ESLint, Prettier, and TypeScript errors
pnpm build       # ensures the app compiles without errors
```

Fix TypeScript errors with `pnpm lint:tsc` first — they are the most blocking.

## Workspace Structure

The root `pnpm-workspace.yaml` defines workspace packages. The main application lives in the repo root (not a nested `packages/` folder). There is a single `package.json` at the root.

## Environment Variables

The app validates env vars at startup via `src/lib/environment.ts` (using `envalid`). Required variables include `BETTER_AUTH_SECRET`, `OIDC_*`, and `DB`. Copy `.env.example` (if present) or see `src/lib/environment.ts` for the full list before running the dev server.
