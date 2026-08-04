# Notion → Thoth import script (THOTH-049)

A standalone, self-contained CLI that syncs content from Notion into a Thoth workspace over
Thoth's public `/api/v1/*` HTTP API. It is **not** part of the Thoth application or its pnpm
project — it has its own `package.json`, `tsconfig.json`, and `vitest.config.ts`, requires zero
Thoth code changes, and stores all of its own state (Notion↔Thoth id mappings, content
fingerprints, and the run report) in a local JSON **state file**.

## Requirements

- Node.js ≥ 20 (native `fetch`, `crypto`, `fs/promises`)
- A Notion integration token (OAuth access token or internal integration secret)
- A Thoth **App API key** (see the Thoth documentation for creating Apps/API keys) with
  `read_write` permission and `workspace` scope

## Installation

This script is isolated from the main Thoth pnpm project — install its dependencies separately:

```bash
git clone https://github.com/danships/thoth
cd thoth/scripts/notion-import
npm install   # or: pnpm install --ignore-workspace
```

## Configuration

All configuration is read from environment variables (a `.env` file is supported via `dotenv` —
do **not** commit it).

| Variable                 | Required | Description                                                                                                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NOTION_TOKEN`           | yes      | Notion bearer token (OAuth access token or internal integration secret)                                                                                                              |
| `THOTH_API_URL`          | yes      | Base URL of Thoth's API, e.g. `https://thoth.example.com/api/v1`                                                                                                                     |
| `THOTH_API_KEY`          | yes      | Thoth App API key (`Authorization: Bearer`)                                                                                                                                          |
| `THOTH_WORKSPACE_ID`     | yes      | Target Thoth workspace id                                                                                                                                                            |
| `STATE_FILE`             | yes      | Path to the local JSON state file (created on first run)                                                                                                                             |
| `THOTH_TARGET_PARENT_ID` | no       | Thoth page id under which imported roots are created (default: workspace root)                                                                                                       |
| `NOTION_ROOT_IDS`        | no       | Comma-separated Notion page/database ids to import (default: full workspace search)                                                                                                  |
| `IMPORT_MODE`            | no       | `auto` (default) / `initial` / `sync` — `initial` forces a full import, ignoring any previously recorded mappings; `auto` picks `initial` when no state file exists yet, else `sync` |
| `DRY_RUN`                | no       | `true`/`1` to preview outcomes without writing to Thoth or advancing the state file                                                                                                  |

The script exits non-zero if any required variable is missing, or if the Notion/Thoth
credentials fail a startup validation call.

## Usage

Initial import (auto-detected because no state file exists yet):

```bash
NOTION_TOKEN=secret_xxx THOTH_API_URL=https://thoth.example.com/api/v1 \
THOTH_API_KEY=thoth_pat_xxx THOTH_WORKSPACE_ID=ws_123 \
THOTH_TARGET_PARENT_ID=page_root STATE_FILE=./ws_123.json \
npm start
```

Scheduled incremental sync (cron every 15 minutes — re-runs as `sync` because the state file now
exists):

```cron
*/15 * * * *  cd /opt/notion-import && \
  NOTION_TOKEN=… THOTH_API_URL=… THOTH_API_KEY=… THOTH_WORKSPACE_ID=ws_123 \
  STATE_FILE=/opt/notion-import/ws_123.json npm start >> import.log 2>&1
```

Dry-run preview of what a sync _would_ change:

```bash
DRY_RUN=true NOTION_TOKEN=… THOTH_API_URL=… THOTH_API_KEY=… \
THOTH_WORKSPACE_ID=ws_123 STATE_FILE=./ws_123.json npm start
```

Multiple workspaces = multiple state files, one invocation each. A `<STATE_FILE>.lock` file
prevents two concurrent runs against the same state file.

## Exit codes

| Code | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| `0`  | `completed` — everything imported/synced cleanly                         |
| `1`  | `partially_completed` — at least one conflict or per-object failure      |
| `2`  | `failed` — a top-level abort (bad auth, unreadable roots, corrupt state) |

## Sync & conflict behaviour

- Only Notion objects whose `last_edited_time` advanced since the last run are re-processed.
- Any object edited in Thoth since the last import is a **conflict** — never overwritten, and
  flagged as `skipped_conflict` in the report.
- Deletions/archival in Notion are recorded (`deletedInNotion: true`) but never mirrored to Thoth.
- The state file is written atomically after each object, so an interrupted run resumes cleanly.

## What migrates (and what doesn't)

See the THOTH-049 spec / PR description for the full feature-gap analysis (the THOTH-049 spec
is an internal planning document and is not publicly available). In short: pages,
databases (as data sources with rows), and most block types migrate; `relation`/`rollup`
properties, table of contents/breadcrumb blocks, comments, and page history do not.

## Development

```bash
npm test        # unit + integration tests for this script (own vitest.config.ts)
npm run lint:tsc # typecheck with this package's own tsconfig.json
```

This package is intentionally excluded from the root Thoth project's `pnpm install`,
`pnpm test:unit`, `pnpm lint:tsc`, and `pnpm lint` — its dependencies (e.g. `@notionhq/client`)
never enter the main application's dependency tree.
