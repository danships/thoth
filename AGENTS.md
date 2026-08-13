# AI Agent Instructions for Thoth

This file contains repo-wide instructions for AI agents working on the Thoth codebase.

## Project Overview

Thoth is a pnpm monorepo. The Next.js application (React 19, Mantine UI, TypeScript) lives in
`apps/web`; the background job runtime (scheduler, queue, webhook delivery, scheduled maintenance
purges) lives in `apps/jobs` (`@thoth/jobs`) as a separate long-running process. `packages/`
contains shared, auth-free libraries consumed by both apps: `@thoth/database` (SuperSave
repositories + auth-free maintenance primitives), `@thoth/storage` (file storage adapter),
`@thoth/job-protocol` (job/queue payload schemas shared between web and jobs), and `@thoth/shared`
(small cross-cutting utilities).

For instructions specific to the web app (architecture, API routes, database scoping rules, file
structure, testing, etc.), see [`apps/web/AGENTS.md`](apps/web/AGENTS.md). For the jobs runtime and
scheduled destructive-maintenance jobs (workspace/page/file purge, terminal job-row pruning), see
[`docs/JOBS_AND_MAINTENANCE.md`](docs/JOBS_AND_MAINTENANCE.md).

## Repository Structure

```
apps/
├── web/                      # Next.js application (see apps/web/AGENTS.md)
└── jobs/                     # @thoth/jobs: scheduler, in-memory queue, webhook delivery,
                               # scheduled maintenance purge/prune handlers (apps/jobs/src/handlers/maintenance)
packages/
├── database/                 # @thoth/database: SuperSave repositories + auth-free maintenance
│                              # primitives (packages/database/src/services/maintenance)
├── storage/                  # @thoth/storage: file storage adapter (local backend)
├── job-protocol/             # @thoth/job-protocol: job/queue payload schemas shared by web + jobs
└── shared/                   # @thoth/shared: small cross-cutting utilities
scripts/                      # Root-level scripts: manual purge CLIs (thin wrappers over the
                               # same @thoth/database maintenance primitives @thoth/jobs uses),
                               # Notion import, dev/release helpers.
docs/                         # Operator-facing docs (JOBS_AND_MAINTENANCE.md, RELEASING.md)
```

## General TypeScript Rules

- Use types instead of interfaces: `type MyType = { ... }` over `interface MyType { ... }`
- All API endpoints should have typed request/response schemas
- Use Zod for runtime validation

## Maintenance ownership & scoping (THOTH-063)

- Destructive maintenance (permanently purging soft-deleted workspaces/pages/data-views, orphaned
  uploaded files, and terminal job-queue rows) has exactly **one** implementation per operation,
  in `packages/database/src/services/maintenance/`. Both the scheduled `@thoth/jobs` handlers
  (`apps/jobs/src/handlers/maintenance/`) and the manual `pnpm {workspaces,pages,files}:purge` CLI
  wrappers (`scripts/purge-*.ts`) call these same primitives — never duplicate purge logic in a
  handler or a script.
- Content deletion (workspaces, pages, data-views) is always scoped by **workspace/root identity**,
  never by creator `userId` — `userId`/similar attribution fields are metadata, not an access or
  selection gate, matching the content-access rule described in `apps/web/AGENTS.md` and the
  `securing-routes`/`database-repositories` skills.
- A package-level maintenance handler must never call `process.exit`, read `apps/web`'s
  environment validator, or print directly to stdout/stderr — the CLI/jobs adapters own
  environment reading, logging, and exit-code mapping. This keeps the same primitive usable from
  both a long-running scheduled job and a short-lived manual CLI process.
- See `docs/JOBS_AND_MAINTENANCE.md` for schedules, grace/retention environment variables, retry/
  lease/idempotency semantics, and dead-job diagnosis.

## Developer Workflows (root-level)

Root `package.json` scripts delegate to workspace packages via `pnpm --filter <pkg> ...` (see
`.agents/skills/pnpm-workflow/SKILL.md` for the full command reference):

- `pnpm dev` / `pnpm build` / `pnpm start` — run the full stack (migrate → `@thoth/jobs` → web)
- `pnpm dev:web` / `pnpm dev:jobs` — run only the web app or only the jobs process
- `pnpm lint` — runs root lint tasks (scripts, tsconfig) plus every workspace package's own lint
- `pnpm lint:tsc` — TypeScript check across the whole workspace
- `pnpm test` / `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e` — run tests across
  every package that defines them (web, jobs, database, storage, job-protocol, shared)
- `pnpm workspaces:purge`, `pnpm pages:purge`, `pnpm files:purge` — manual maintenance CLIs; see
  `docs/JOBS_AND_MAINTENANCE.md` for their exact semantics and required environment variables

## Testing & Quality

- Only commit changes when explicitly requested by the user
- Never add custom patches (e.g. via `pnpm patch`/`patches/*.patch`) to work around a broken
  ESLint rule or dependency incompatibility. Instead, disable the offending rule (or fix the
  root cause via config, e.g. explicit `settings`) in the relevant `eslint.config.mjs`.
- Run `pnpm build`, `pnpm lint`, and `pnpm test` after making significant changes across any
  package. Fix TypeScript errors (`pnpm lint:tsc`) before opening PRs. Changes touching
  `apps/jobs` or `packages/database`'s maintenance primitives should also re-run the full test
  suite for both, since the scheduled handlers and the manual CLI wrappers share the same code.

## Skills

The following agent skills provide targeted guidance for specific tasks:

| Skill                   | Path                                            | Purpose                                                                                                                      |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `react-tsx-components`  | `.agents/skills/react-tsx-components/SKILL.md`  | Styling and error-handling conventions when editing `*.tsx` component files                                                  |
| `pnpm-workflow`         | `.agents/skills/pnpm-workflow/SKILL.md`         | pnpm commands, available scripts, quality-gate workflow, and env-var setup                                                   |
| `api-route-definition`  | `.agents/skills/api-route-definition/SKILL.md`  | Creating API routes with the `apiRoute` wrapper, file placement, HTTP exports, error handling, and the client helper pattern |
| `zod-types-schemas`     | `.agents/skills/zod-types-schemas/SKILL.md`     | Defining Zod schemas and TypeScript types for API endpoints, naming conventions, and `DataWrapper` usage                     |
| `securing-routes`       | `.agents/skills/securing-routes/SKILL.md`       | Content access via `assertContentAccess` (membership + unified `AccessGrant`); per-user state (`ContainerAccess`) stays user-scoped              |
| `database-repositories` | `.agents/skills/database-repositories/SKILL.md` | Using SuperSave repositories, query building, entity definitions, retrievers, migration patterns, and the auth-free maintenance primitives in `packages/database/src/services/maintenance` |

