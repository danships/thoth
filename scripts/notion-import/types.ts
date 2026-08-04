// Shared types for the standalone Notion → Thoth import script.
//
// This script is intentionally self-contained: it does not import any server-only Thoth module.
// It only talks to Thoth over its public HTTP API (`/api/v1/*`) and to Notion via
// `@notionhq/client`. All shapes below are duplicated (not imported) from the Thoth codebase on
// purpose — see the module-level comment in `thoth-client.ts`.

export type SelectColor =
  'blue' | 'cyan' | 'teal' | 'green' | 'lime' | 'yellow' | 'orange' | 'red' | 'pink' | 'grape' | 'gray';

export type NotionObjectType = 'page' | 'database' | 'database_row';

export type SyncMode = 'initial' | 'sync';

export type SyncOutcome = 'created' | 'updated' | 'skipped_unchanged' | 'skipped_conflict' | 'unsupported' | 'failed';

export type RunState = 'completed' | 'partially_completed' | 'failed';

export type Mapping = {
  notionType: NotionObjectType;
  thothContainerId: string | null;
  thothColumnId: string | null;
  notionLastEditedTime: string;
  importedContentHash: string;
  deletedInNotion: boolean;
  // Server-assigned column/option ids for database properties, keyed by the Notion property
  // name. Populated for `database` mappings so row conversion can reference the correct ids.
  columnMappings?: Record<string, ColumnMapping>;
};

export type ColumnMapping = {
  thothColumnId: string;
  type: string;
  optionIdsByLabel?: Record<string, string> | undefined;
};

export type RunStats = {
  created: number;
  updated: number;
  skippedUnchanged: number;
  skippedConflict: number;
  unsupported: number;
  failed: number;
};

export type ReportEntry = {
  notionId: string;
  notionType: NotionObjectType;
  title: string;
  outcome: SyncOutcome;
  thothContainerId: string | null;
  detail?: string | undefined;
};

export type LastRun = {
  startedAt: string;
  finishedAt: string | null;
  mode: SyncMode;
  dryRun: boolean;
  state: RunState;
  stats: RunStats;
  error: string | null;
  report: ReportEntry[];
};

export type Connection = {
  notionWorkspaceId: string | null;
  thothWorkspaceId: string;
  targetParentId: string | null;
};

export type StateFile = {
  version: 1;
  connection: Connection;
  mappings: Record<string, Mapping>;
  lastRun: LastRun;
};

export function createEmptyStats(): RunStats {
  return {
    created: 0,
    updated: 0,
    skippedUnchanged: 0,
    skippedConflict: 0,
    unsupported: 0,
    failed: 0,
  };
}

export function createInitialStateFile(connection: Connection): StateFile {
  return {
    version: 1,
    connection,
    mappings: {},
    lastRun: {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      mode: 'initial',
      dryRun: false,
      state: 'completed',
      stats: createEmptyStats(),
      error: null,
      report: [],
    },
  };
}
