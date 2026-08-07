# AI Agent Instructions for Thoth

This file contains repo-wide instructions for AI agents working on the Thoth codebase.

## Project Overview

Thoth is a pnpm monorepo. The Next.js 16 application (React 19, Mantine UI 8, TypeScript) lives in
`apps/web`; the repository root is a thin workspace orchestrator whose commands delegate to
`apps/web`. `packages/` is currently empty, reserved for future extracted packages.

For instructions specific to the web app (architecture, API routes, database scoping rules,
file structure, testing, etc.), see [`apps/web/AGENTS.md`](apps/web/AGENTS.md).

## Repository Structure

```
apps/
└── web/                      # Next.js application (see apps/web/AGENTS.md)
packages/                     # Reserved for future extracted packages
scripts/                      # Root-level maintenance scripts (purge jobs, etc.)
```

## General TypeScript Rules

- Use types instead of interfaces: `type MyType = { ... }` over `interface MyType { ... }`
- All API endpoints should have typed request/response schemas
- Use Zod for runtime validation

## Developer Workflows (root-level)

Root `package.json` scripts delegate to the `@thoth/web` workspace package via
`pnpm --filter @thoth/web ...`:

- `pnpm dev` / `pnpm build` / `pnpm start` — run the web app
- `pnpm lint` — runs root lint tasks (scripts) plus `pnpm --filter @thoth/web lint`
- `pnpm lint:tsc` — TypeScript check across the workspace
- `pnpm test` / `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e` — delegate to `apps/web`
- `pnpm workspaces:purge`, `pnpm pages:purge`, `pnpm files:purge` — root-level maintenance scripts in `scripts/`

## Testing & Quality

- Only commit changes when explicitly requested by the user
- Never add custom patches (e.g. via `pnpm patch`/`patches/*.patch`) to work around a broken
  ESLint rule or dependency incompatibility. Instead, disable the offending rule (or fix the
  root cause via config, e.g. explicit `settings`) in the relevant `eslint.config.mjs`.
- Run `pnpm build` and `pnpm lint` after making significant changes. Fix TypeScript errors
  (`pnpm lint:tsc`) before opening PRs.

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
