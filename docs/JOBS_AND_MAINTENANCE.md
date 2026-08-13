# Jobs & maintenance operations (THOTH-063)

This document is the operator-facing reference for Thoth's background job runtime
(`@thoth/jobs`) and its scheduled destructive-maintenance jobs (workspace/page/file purge, and
terminal job-row pruning). It complements — and does not duplicate — the root
[`README.md`](../README.md) (environment variables, PM2 process topology, available scripts) and
the code-level comments in `apps/jobs/src/index.ts`, `apps/jobs/src/environment.ts`, and
`packages/database/src/services/maintenance/`.

## Package layout

| Path | Owns |
|------|------|
| `packages/database/src/services/maintenance/` | Auth-free, DB-pure primitives: eligible-row batch queries, workspace cascade deletion, deleted-root permanent deletion, dangling file-usage resolution, and terminal-job-row pruning queries. No process/environment/logging concerns — pure functions over a `@thoth/database` context. |
| `apps/jobs/src/handlers/maintenance/` | The four scheduled job handlers (`purge-workspaces.ts`, `purge-pages.ts`, `purge-files.ts`, `prune-jobs.ts`). Each wraps the primitives above with bounded batch/time limits, lease/abort-signal awareness, continuation enqueueing, and structured logging. |
| `apps/jobs/src/index.ts` | Registers the four production interval schedules (see below) and wires the job registry/queue/storage singletons. |
| `scripts/purge-cli-shared.ts` + `scripts/purge-deleted-{workspaces,pages,files}.ts` | Thin manual CLI wrappers over the *same* `@thoth/database` maintenance primitives the job handlers call — not a separate implementation. |

Both the scheduled job handlers and the manual CLI commands call the same underlying primitives,
so their behaviour (grace periods, race-safety margins, deletion ordering, idempotency) is
identical by construction — there is exactly one implementation of "how to purge a workspace",
not two that could drift.

## Fixed schedules

Registered once, at `@thoth/jobs` startup, in `apps/jobs/src/index.ts` (disabled under
`NODE_ENV=test`, where the integration/e2e suites enqueue jobs directly instead):

| Job type | Interval | Purpose |
|----------|----------|---------|
| `maintenance.purge-files` | hourly | Deletes dangling `file-usage` rows and orphaned uploaded files (storage bytes + DB row) past `FILES_PURGE_GRACE_PERIOD_HOURS`. |
| `maintenance.purge-pages` | daily | Permanently deletes soft-deleted page/data-view roots past `PAGE_DELETE_GRACE_PERIOD_DAYS`. |
| `maintenance.purge-workspaces` | daily | Permanently deletes soft-deleted workspaces (and their full cascade) past `WORKSPACE_DELETE_GRACE_PERIOD_DAYS`. |
| `maintenance.prune-jobs` | daily | Deletes terminal (`completed`/`dead`) job-queue rows past `JOB_COMPLETED_RETENTION_DAYS`/`JOB_DEAD_RETENTION_DAYS`. |

There is no cron expression and no per-tenant/user-configurable schedule — only the four fixed
intervals above, each tunable only via its grace/retention environment variable (see the root
README's "Environment variables" section for the full list and defaults).

**Current-bucket catch-up:** on process startup, the scheduler enqueues the current interval
bucket's occurrence immediately (rather than waiting a full interval) using an idempotency key of
`schedule:<type>:<bucket>`. This means: if the service was down across one or more scheduled
occurrences, the very next boot performs one catch-up pass; because every handler selects
candidates by grace/live-state (not by "was I already run this bucket"), this catch-up is always
safe and covers any eligible rows that accumulated while the service was down. A repeat/duplicate
occurrence for a bucket that already ran is naturally suppressed by the idempotency key, and
active-type-level dedupe (only one instance of a given maintenance type may be queued/running at
once) prevents a slow-running job from overlapping with its own next scheduled occurrence.

## Manual CLI commands

```bash
pnpm workspaces:purge   # tsx scripts/purge-deleted-workspaces.ts
pnpm pages:purge        # tsx scripts/purge-deleted-pages.ts
pnpm files:purge        # tsx scripts/purge-deleted-files.ts
```

Each command:

- Requires `DB` (and, for `files:purge`, `STORAGE_TYPE`/`STORAGE_LOCAL_FOLDER`) to be set
  explicitly in the environment — **it never guesses a default connection string**. Missing
  configuration is a loud, immediate failure (non-zero exit, clear error message), not a silent
  no-op against an unintended database.
- Opens the database with `skipSync: true` — **it never auto-syncs or migrates the schema.**
  Run `pnpm db:migrate` first if you're pointing it at a fresh/upgraded database.
- Loops in `MAINTENANCE_PURGE_BATCH_SIZE`-sized batches (default 100) using the same
  offset/continuation contract the scheduled job handlers use, until every currently-eligible
  row has been processed.
- Prints a one-line, human-readable summary of counts on success, and a non-zero exit code (via
  `process.exitCode`, not `process.exit()`, so any pending I/O flushes first) with the error
  message on failure.

**Do not run a manual purge command concurrently with its scheduled job**, or two manual
invocations of the same command concurrently. The scheduler's active-type-level dedupe only
protects against *scheduled* overlap; a manually-invoked CLI process is a separate process outside
that lock. Running one of these commands is safe at any other time — grace periods, race-safety
margins, and immediate revalidation-before-delete make each individual purge idempotent, but two
processes racing to delete the *same* row concurrently is still best avoided operationally (e.g.
by not running `pnpm workspaces:purge` by hand shortly before/after its daily scheduled run).

## Retry / lease / idempotency semantics

- Each handler execution accepts a lease/abort signal; when it's lost mid-batch, the handler
  **stops before selecting or deleting the next target** rather than racing a second worker for
  the same row. There is no multi-worker/multi-instance claim protocol — `@thoth/jobs` runs as a
  single PM2 instance (`instances: 1`), so this is a safety margin against a slow shutdown/leader
  handoff, not a distributed-locking mechanism.
- When a batch reaches its item-count/time limit with work remaining, the handler enqueues a
  **continuation** child job carrying the next offset/cursor, using an idempotency key tied to
  the parent job so a duplicate continuation attempt (e.g. after a crash-and-restart) reuses the
  same child rather than multiplying it.
- Every purge/prune operation is safe to run twice: a row already deleted by an earlier attempt
  is treated as "already handled" (success), not an error. A partially-completed cascade (e.g. a
  workspace whose containers were deleted but not yet the workspace row itself) simply continues
  from whatever rows remain on the next attempt.

## Dead-job diagnosis

- A job transitions to `dead` after exhausting its retry budget. The runner logs a single
  `job.dead` error-level event **exactly once** per job at that transition — restarts, queue
  scans, or `maintenance.prune-jobs` runs never re-emit it for the same row, so alerting on
  `job.dead` in your log pipeline will not flap or repeat.
- `dead` rows are retained for at least `JOB_DEAD_RETENTION_DAYS` (default 30) specifically so
  there's a long diagnostic window before `maintenance.prune-jobs` removes them. Inspect the
  structured log line for that job's `id`/`type`/`parentId`/attempt count and the sanitised error
  recorded on the row — logs never contain raw payloads, file contents, or secrets.
- `maintenance.prune-jobs` never deletes `queued`/`running` jobs, a terminal parent that still has
  active (non-terminal) children, or any row still inside an active continuation/idempotency
  horizon — only clearly terminal, no-longer-referenced rows older than their configured
  retention.

## Safe restart recovery

- On restart, `@thoth/jobs` does **not** resume in-flight leased work from a previous process —
  the queue is fully in-memory and per-process (see the "Data model" note in
  `apps/jobs/src/queue/`); a crash mid-batch simply means the next scheduled occurrence (or the
  immediate current-bucket catch-up on the very next boot) picks up any remaining eligible rows,
  because grace/live-state selection is idempotent by construction.
- Migrations are never run automatically by either the scheduled jobs process or the manual CLI
  commands — only `pnpm db:migrate` (the standalone `@thoth/database` migration CLI), run once
  before either PM2-managed process starts. See the root README's "Process topology" section for
  the full PM2 child/startup-ordering reference.
