// Orchestrates a full import/sync run: bootstrap → fetch (Notion BFS) → convert+write (Thoth) →
// link-resolution pass → finalize. Depends on `NotionClientLike`/`ThothClientLike` interfaces
// (not the concrete classes) so tests can inject fakes without hitting real Notion/Thoth APIs.

import { blocksToMarkdown, type NotionBlockNode, type UploadedFile } from './convert/blocks';
import { convertPropertyDefinition, convertPropertyValue, type NotionPropertyDefinition } from './convert/database';
import { richTextToPlainText } from './convert/rich-text';
import { hashMarkdown, hashJson } from './hash';
import { decideInitialAction, decideAfterThothRead } from './sync';
import type { Config } from './config';
import { createInitialStateFile, createEmptyStats, type StateFile, type ReportEntry, type SyncOutcome } from './types';
import type { PrimitiveColumnInput, ThothPageValue } from './thoth-client';
import { redactSecrets } from './redact';

export type NotionBlockLike = {
  id: string;
  type: string;
  archived?: boolean;
  has_children?: boolean;
  [key: string]: unknown;
};

export type NotionPageLike = {
  id: string;
  object: 'page';
  archived?: boolean;
  last_edited_time: string;
  icon?: { type: string; emoji?: string } | null;
  properties: Record<string, { type: string; title?: unknown; [key: string]: unknown }>;
  parent: { type: string };
};

export type NotionDatabaseLike = {
  id: string;
  object: 'database';
  archived?: boolean;
  last_edited_time: string;
  title?: { plain_text: string }[];
  properties: Record<string, NotionPropertyDefinition>;
  // The Notion *data source* id backing this database (2025+ API): rows are queried and
  // properties are defined on the data source, not the database container itself. For a
  // single-data-source database this equals `id` (the object returned by search/retrieve here
  // *is* the data source), kept as an explicit field for clarity at call sites.
  dataSourceId: string;
};

export type NotionClientLike = {
  validateTokenAndGetWorkspaceId(): Promise<string | null>;
  fetchRoots(explicitRootIds: string[] | null): Promise<(NotionPageLike | NotionDatabaseLike)[]>;
  listBlockChildren(blockId: string): Promise<NotionBlockLike[]>;
  queryDatabaseRows(dataSourceId: string): Promise<NotionPageLike[]>;
  retrieve(id: string): Promise<NotionPageLike | NotionDatabaseLike | null>;
};

export type ThothClientLike = {
  validateConnection(): Promise<void>;
  createPage(input: {
    name: string;
    emoji?: string | null | undefined;
    parentId?: string | null | undefined;
    workspaceId?: string | undefined;
  }): Promise<{ id: string }>;
  getPageContent(pageId: string): Promise<string>;
  setPageContent(pageId: string, content: string): Promise<void>;
  getPageValues(pageId: string): Promise<Record<string, ThothPageValue>>;
  updatePageValues(pageId: string, values: Record<string, ThothPageValue>): Promise<void>;
  createDataSource(input: {
    name: string;
    columns?: PrimitiveColumnInput[] | undefined;
    workspaceId?: string | undefined;
  }): Promise<{ id: string; columns: { id: string; name: string }[] }>;
  addDataSourceColumn(
    dataSourceId: string,
    input: unknown
  ): Promise<{ id: string; options?: { id: string; label: string }[] }>;
  uploadFile(input: {
    filename: string;
    mimeType: string;
    data: Buffer;
    pageId?: string | undefined;
    workspaceId?: string | undefined;
  }): Promise<UploadedFile>;
};

export type ImportContext = {
  config: Config;
  notion: NotionClientLike;
  thoth: ThothClientLike;
  state: StateFile;
  now: () => Date;
};

function titleOf(properties: Record<string, { type: string; title?: unknown }>): string {
  for (const property of Object.values(properties)) {
    if (property.type === 'title') {
      return richTextToPlainText(property.title as never) || 'Untitled';
    }
  }
  return 'Untitled';
}

function pushReport(context: ImportContext, entry: ReportEntry) {
  context.state.lastRun.report.push(entry);
  const statKey: Partial<Record<SyncOutcome, keyof StateFile['lastRun']['stats']>> = {
    created: 'created',
    updated: 'updated',
    skipped_unchanged: 'skippedUnchanged',
    skipped_conflict: 'skippedConflict',
    unsupported: 'unsupported',
    failed: 'failed',
  };
  const key = statKey[entry.outcome];
  if (key) {
    context.state.lastRun.stats[key] += 1;
  }
}

// Applied to the Notion-hosted media fetch below so a stalled/unresponsive host fails fast
// instead of hanging the whole BFS walk indefinitely.
const MEDIA_FETCH_TIMEOUT_MS = 30_000;

// Recursively builds the block tree for a Notion page/block, uploading file-like blocks to
// Thoth as it goes (skipped entirely in dry-run mode — no writes of any kind happen then).
async function buildBlockTree(
  context: ImportContext,
  blockId: string,
  thothPageId: string | null,
  discovered: { id: string; parentNotionId: string }[]
): Promise<NotionBlockNode[]> {
  const children = await context.notion.listBlockChildren(blockId);
  const nodes: NotionBlockNode[] = [];

  for (const block of children) {
    if (block.type === 'child_page' || block.type === 'child_database') {
      discovered.push({ id: block.id, parentNotionId: blockId });
    }

    const node: NotionBlockNode = {
      id: block.id,
      type: block.type,
      archived: block.archived,
      payload: (block[block.type] as Record<string, unknown>) ?? {},
    };

    if (['image', 'file', 'pdf', 'video', 'audio'].includes(block.type)) {
      const media = node.payload as {
        type?: string;
        file?: { url: string };
        external?: { url: string };
        caption?: unknown;
      };
      const url = media.file?.url ?? media.external?.url ?? null;
      node.originalUrl = url;
      if (url && !context.config.dryRun) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS) });
          if (!response.ok) {
            throw new Error(`fetch failed with status ${response.status}`);
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          const filename = url.split('/').pop()?.split('?', 1)[0] || `${block.type}-${block.id}`;
          node.upload = await context.thoth.uploadFile({
            filename,
            mimeType: response.headers.get('content-type') || 'application/octet-stream',
            data: buffer,
            pageId: thothPageId ?? undefined,
            workspaceId: context.config.thothWorkspaceId,
          });
        } catch (error) {
          node.upload = null;
          // Report why the fallback (a plain link to the original Notion URL) is being used —
          // an operator watching the run should be able to tell a timeout/404/upload error from
          // "everything's fine", rather than silently downgrading a media block.
          console.warn(
            `[notion-import] Failed to fetch/upload media for block ${block.id} (${block.type}) from ${url}: ` +
              `${error instanceof Error ? error.message : String(error)} — falling back to a link to the original Notion URL.`
          );
        }
      }
    }

    if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
      node.children = await buildBlockTree(context, block.id, thothPageId, discovered);
    }

    nodes.push(node);
  }

  return nodes;
}

async function processPage(
  context: ImportContext,
  notionPage: NotionPageLike,
  thothParentId: string | null,
  discovered: { id: string; parentNotionId: string }[]
): Promise<void> {
  const title = titleOf(notionPage.properties);
  const existingMapping = context.state.mappings[notionPage.id];

  const initial = decideInitialAction({
    mapping: existingMapping,
    notionLastEditedTime: notionPage.last_edited_time,
    notionArchived: Boolean(notionPage.archived),
  });

  if (initial.action === 'skip_unchanged' || initial.action === 'skip_archived') {
    if (initial.action === 'skip_archived' && existingMapping) {
      existingMapping.deletedInNotion = true;
    }
    pushReport(context, {
      notionId: notionPage.id,
      notionType: 'page',
      title,
      outcome: 'skipped_unchanged',
      thothContainerId: existingMapping?.thothContainerId ?? null,
      detail: initial.action === 'skip_archived' ? initial.detail : undefined,
    });
    return;
  }

  let thothPageId = existingMapping?.thothContainerId ?? null;

  if (initial.action === 'create') {
    if (!context.config.dryRun) {
      const created = await context.thoth.createPage({
        name: title,
        emoji: notionPage.icon?.type === 'emoji' ? notionPage.icon.emoji : null,
        parentId: thothParentId,
        workspaceId: thothParentId ? undefined : context.config.thothWorkspaceId,
      });
      thothPageId = created.id;
    }
  } else {
    // needs_thoth_read: compare the current Thoth content hash to what we last wrote.
    if (!existingMapping || !thothPageId) {
      throw new Error(`Inconsistent state: expected a mapping for existing page ${notionPage.id}`);
    }
    const currentContent = context.config.dryRun ? '' : await context.thoth.getPageContent(thothPageId);
    const currentHash = hashMarkdown(currentContent);
    const decision = decideAfterThothRead(existingMapping, currentHash);
    if (decision.action === 'conflict') {
      pushReport(context, {
        notionId: notionPage.id,
        notionType: 'page',
        title,
        outcome: 'skipped_conflict',
        thothContainerId: thothPageId,
        detail: decision.detail,
      });
      return;
    }
  }

  // In dry-run mode, still discover children (and record them for BFS) for an accurate preview,
  // but never upload files or write to Thoth — `buildBlockTree` itself no-ops those under
  // `config.dryRun`. The previously-discarded result is now kept so the preview's `markdown`/
  // `unsupportedTypes` reflect the full tree instead of always being empty.
  const blockNodes = await buildBlockTree(
    context,
    notionPage.id,
    context.config.dryRun ? null : thothPageId,
    discovered
  );
  const { markdown, unsupportedTypes } = blocksToMarkdown(blockNodes);

  if (!context.config.dryRun && thothPageId) {
    await context.thoth.setPageContent(thothPageId, markdown);
  }

  const outcome: SyncOutcome = initial.action === 'create' ? 'created' : 'updated';
  if (!context.config.dryRun) {
    context.state.mappings[notionPage.id] = {
      notionType: 'page',
      thothContainerId: thothPageId,
      thothColumnId: null,
      notionLastEditedTime: notionPage.last_edited_time,
      importedContentHash: hashMarkdown(markdown),
      deletedInNotion: false,
    };
  }

  pushReport(context, {
    notionId: notionPage.id,
    notionType: 'page',
    title,
    outcome,
    thothContainerId: thothPageId,
    detail:
      unsupportedTypes.length > 0
        ? `Unsupported blocks dropped: ${[...new Set(unsupportedTypes)].join(', ')}`
        : undefined,
  });
}

async function processDatabase(
  context: ImportContext,
  notionDatabase: NotionDatabaseLike,
  thothParentId: string | null
): Promise<void> {
  const title = notionDatabase.title?.map((segment) => segment.plain_text).join('') || 'Untitled database';
  const existingMapping = context.state.mappings[notionDatabase.id];

  const initial = decideInitialAction({
    mapping: existingMapping,
    notionLastEditedTime: notionDatabase.last_edited_time,
    notionArchived: Boolean(notionDatabase.archived),
  });

  if (initial.action === 'skip_unchanged' || initial.action === 'skip_archived') {
    if (initial.action === 'skip_archived' && existingMapping) {
      existingMapping.deletedInNotion = true;
    }
    pushReport(context, {
      notionId: notionDatabase.id,
      notionType: 'database',
      title,
      outcome: 'skipped_unchanged',
      thothContainerId: existingMapping?.thothContainerId ?? null,
    });
    return;
  }

  const columnMappings: Record<
    string,
    { thothColumnId: string; type: string; optionIdsByLabel?: Record<string, string> | undefined }
  > = {};
  const unsupportedProperties: string[] = [];
  let thothDataSourceId = existingMapping?.thothContainerId ?? null;
  const notionDataSourceId = notionDatabase.dataSourceId;

  if (initial.action === 'create') {
    const primitiveColumns: PrimitiveColumnInput[] = [];
    const extendedDefinitions: { name: string; definition: ReturnType<typeof convertPropertyDefinition> }[] = [];

    for (const property of Object.values(notionDatabase.properties)) {
      const outcome = convertPropertyDefinition(property);
      if (outcome.kind === 'skipped') {
        unsupportedProperties.push(`${property.name}: ${outcome.reason}`);
        continue;
      }
      if (outcome.kind === 'primitive') {
        primitiveColumns.push(outcome.column);
      } else {
        extendedDefinitions.push({ name: property.name, definition: outcome });
      }
    }

    if (!context.config.dryRun) {
      const created = await context.thoth.createDataSource({
        name: title,
        columns: primitiveColumns,
        workspaceId: thothParentId ? undefined : context.config.thothWorkspaceId,
      });
      thothDataSourceId = created.id;
      for (const column of created.columns) {
        columnMappings[column.name] = { thothColumnId: column.id, type: 'string' };
      }

      for (const { name, definition } of extendedDefinitions) {
        if (definition.kind !== 'extended') continue;
        const createdColumn = await context.thoth.addDataSourceColumn(thothDataSourceId, definition.column);
        const optionIdsByLabel: Record<string, string> = {};
        for (const option of createdColumn.options ?? []) {
          optionIdsByLabel[option.label] = option.id;
        }
        columnMappings[name] = {
          thothColumnId: createdColumn.id,
          type: definition.column.type,
          optionIdsByLabel: Object.keys(optionIdsByLabel).length > 0 ? optionIdsByLabel : undefined,
        };
      }
    }
  } else if (existingMapping?.columnMappings) {
    Object.assign(columnMappings, existingMapping.columnMappings);
  } else {
    // The existing mapping doesn't carry the column mappings needed to convert row values (state
    // file corruption, or a mapping created by an older/incompatible version of this script).
    // Never fall through with an empty `columnMappings` here — that would silently convert every
    // row property to "unsupported" and, worse, overwrite existing Thoth row values with `{}`.
    // Fail this database's update loudly instead so it's reported/retried, not silently lost.
    throw new Error(
      `Inconsistent state: expected persisted column mappings for existing database ${notionDatabase.id}`
    );
  }

  if (!context.config.dryRun) {
    context.state.mappings[notionDatabase.id] = {
      notionType: 'database',
      thothContainerId: thothDataSourceId,
      thothColumnId: null,
      notionLastEditedTime: notionDatabase.last_edited_time,
      importedContentHash: hashJson(columnMappings),
      deletedInNotion: false,
      columnMappings,
    };
  }

  pushReport(context, {
    notionId: notionDatabase.id,
    notionType: 'database',
    title,
    outcome: initial.action === 'create' ? 'created' : 'updated',
    thothContainerId: thothDataSourceId,
    detail:
      unsupportedProperties.length > 0 ? `Unsupported properties: ${unsupportedProperties.join('; ')}` : undefined,
  });

  if (context.config.dryRun || !thothDataSourceId) {
    return;
  }

  const rows = await context.notion.queryDatabaseRows(notionDataSourceId);
  for (const row of rows) {
    await processDatabaseRow(context, row, thothDataSourceId, columnMappings);
  }
}

async function processDatabaseRow(
  context: ImportContext,
  row: NotionPageLike,
  dataSourceId: string,
  columnMappings: Record<
    string,
    { thothColumnId: string; type: string; optionIdsByLabel?: Record<string, string> | undefined }
  >
): Promise<void> {
  const title = titleOf(row.properties);
  const existingMapping = context.state.mappings[row.id];

  const initial = decideInitialAction({
    mapping: existingMapping,
    notionLastEditedTime: row.last_edited_time,
    notionArchived: Boolean(row.archived),
  });

  if (initial.action === 'skip_unchanged' || initial.action === 'skip_archived') {
    if (initial.action === 'skip_archived' && existingMapping) {
      existingMapping.deletedInNotion = true;
    }
    pushReport(context, {
      notionId: row.id,
      notionType: 'database_row',
      title,
      outcome: 'skipped_unchanged',
      thothContainerId: existingMapping?.thothContainerId ?? null,
    });
    return;
  }

  const values: Record<string, ThothPageValue> = {};
  const unsupportedColumns: string[] = [];
  for (const [propertyName, propertyValue] of Object.entries(row.properties)) {
    const columnMapping = columnMappings[propertyName];
    if (!columnMapping) {
      unsupportedColumns.push(`${propertyName}: no matching Thoth column`);
      continue;
    }
    const converted = convertPropertyValue(propertyValue as Record<string, unknown>, columnMapping);
    if ('skipped' in converted) {
      unsupportedColumns.push(converted.skipped);
      continue;
    }
    values[columnMapping.thothColumnId] = converted;
  }

  let rowPageId = existingMapping?.thothContainerId ?? null;

  if (initial.action === 'create') {
    if (!context.config.dryRun) {
      const created = await context.thoth.createPage({ name: title, parentId: dataSourceId });
      rowPageId = created.id;
    }
  } else {
    if (!existingMapping || !rowPageId) {
      throw new Error(`Inconsistent state: expected a mapping for existing row ${row.id}`);
    }
    const currentValues = context.config.dryRun ? {} : await context.thoth.getPageValues(rowPageId);
    const currentHash = hashJson(currentValues);
    const decision = decideAfterThothRead(existingMapping, currentHash);
    if (decision.action === 'conflict') {
      pushReport(context, {
        notionId: row.id,
        notionType: 'database_row',
        title,
        outcome: 'skipped_conflict',
        thothContainerId: rowPageId,
        detail: decision.detail,
      });
      return;
    }
  }

  // Defense in depth: `processDatabase` already skips calling this function entirely in
  // dry-run mode, but guard the actual Thoth writes/state mutation here too, so this function
  // can never mutate anything on its own regardless of how/when it's called.
  if (!context.config.dryRun && rowPageId) {
    await context.thoth.updatePageValues(rowPageId, values);
  }

  if (!context.config.dryRun) {
    context.state.mappings[row.id] = {
      notionType: 'database_row',
      thothContainerId: rowPageId,
      thothColumnId: null,
      notionLastEditedTime: row.last_edited_time,
      importedContentHash: hashJson(values),
      deletedInNotion: false,
    };
  }

  pushReport(context, {
    notionId: row.id,
    notionType: 'database_row',
    title,
    outcome: initial.action === 'create' ? 'created' : 'updated',
    thothContainerId: rowPageId,
    detail: unsupportedColumns.length > 0 ? `Unsupported values: ${unsupportedColumns.join('; ')}` : undefined,
  });
}

// Rewrites `{{notion-page-link:<id>}}` placeholders left in Markdown bodies into real Thoth page
// links, then re-writes the content — only for pages this run actually wrote (never
// conflict-skipped pages, and never in dry-run mode).
async function resolveLinks(context: ImportContext, writtenPageIds: Set<string>): Promise<void> {
  if (context.config.dryRun) {
    return;
  }
  for (const notionId of writtenPageIds) {
    const mapping = context.state.mappings[notionId];
    if (!mapping?.thothContainerId) {
      continue;
    }
    const content = await context.thoth.getPageContent(mapping.thothContainerId);
    if (!content.includes('{{notion-page-link:')) {
      continue;
    }
    const resolved = content.replaceAll(/\{\{notion-page-link:([^}]+)\}\}/g, (_match, linkedNotionId: string) => {
      const linkedMapping = context.state.mappings[linkedNotionId];
      // Prefer the linked page's actual title (from this run's report, which every visited page
      // is added to) over the raw Notion id, which isn't meaningful to a reader.
      const linkedTitle = context.state.lastRun.report.find((entry) => entry.notionId === linkedNotionId)?.title;
      if (linkedMapping?.thothContainerId) {
        return `[${linkedTitle ?? linkedNotionId}](/pages/${linkedMapping.thothContainerId})`;
      }
      // Never silently drop a link the source content pointed to — returning '' would make
      // referenced content vanish without a trace. Keep it visible (even if not clickable) so a
      // reader/operator can tell something was linked here but couldn't be resolved.
      return `[${linkedTitle ?? `Unresolved Notion page (${linkedNotionId})`}]`;
    });
    if (resolved !== content) {
      await context.thoth.setPageContent(mapping.thothContainerId, resolved);
      mapping.importedContentHash = hashMarkdown(resolved);
    }
  }
}

export type RunResult = { exitCode: number; state: StateFile };

export async function runImport(
  config: Config,
  notion: NotionClientLike,
  thoth: ThothClientLike,
  existingState: StateFile | null
): Promise<RunResult> {
  const state: StateFile =
    existingState ??
    createInitialStateFile({
      notionWorkspaceId: null,
      thothWorkspaceId: config.thothWorkspaceId,
      targetParentId: config.thothTargetParentId,
    });

  const mode = config.importMode === 'auto' ? (existingState ? 'sync' : 'initial') : config.importMode;

  if (mode === 'initial') {
    // IMPORT_MODE=initial forces a full import regardless of any mappings recorded by a
    // previous run — this is the explicit "start over" escape hatch, so any previously-seen
    // objects must be treated as brand new rather than skipped/updated via stale mappings.
    state.mappings = {};
  }

  state.lastRun = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    mode,
    dryRun: config.dryRun,
    state: 'completed',
    stats: createEmptyStats(),
    error: null,
    report: [],
  };

  const context: ImportContext = { config, notion, thoth, state, now: () => new Date() };
  const writtenPageIds = new Set<string>();

  try {
    await thoth.validateConnection();
    const notionWorkspaceId = await notion.validateTokenAndGetWorkspaceId();

    if (
      existingState &&
      notionWorkspaceId &&
      existingState.connection.notionWorkspaceId &&
      notionWorkspaceId !== existingState.connection.notionWorkspaceId
    ) {
      console.warn(
        '[notion-import] WARNING: connected Notion workspace differs from the one recorded in the state file. Treating all objects as new.'
      );
      state.mappings = {};
    }
    if (!state.connection.notionWorkspaceId) {
      // Backfill whenever the workspace id isn't already recorded — not just on a brand-new
      // state file. A state file can legitimately have `notionWorkspaceId: null` (freshly
      // created but not yet run to completion, or created before this field existed) and should
      // still get it recorded. Never overwrite an already-recorded id (the mismatch guard above
      // handles that case explicitly).
      state.connection.notionWorkspaceId = notionWorkspaceId;
    }

    const roots = await notion.fetchRoots(config.notionRootIds);
    const visited = new Set<string>();
    const queue: { id: string; parentNotionId: string | null }[] = roots.map((root) => ({
      id: root.id,
      parentNotionId: null,
    }));
    const parentThothIdByNotionId = new Map<string, string | null>();
    for (const root of roots) {
      parentThothIdByNotionId.set(root.id, config.thothTargetParentId);
    }

    while (queue.length > 0) {
      const { id, parentNotionId } = queue.shift()!;
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);

      const object = await notion.retrieve(id);
      if (!object) {
        continue;
      }

      let thothParentId: string | null;
      if (parentThothIdByNotionId.has(id)) {
        thothParentId = parentThothIdByNotionId.get(id) ?? null;
      } else if (parentNotionId) {
        thothParentId = context.state.mappings[parentNotionId]?.thothContainerId ?? null;
      } else {
        thothParentId = config.thothTargetParentId;
      }

      const discovered: { id: string; parentNotionId: string }[] = [];

      try {
        if (object.object === 'database') {
          await processDatabase(context, object, thothParentId);
        } else {
          const reportLengthBefore = context.state.lastRun.report.length;
          await processPage(context, object, thothParentId, discovered);
          const newEntries = context.state.lastRun.report.slice(reportLengthBefore);
          const ownEntry = newEntries.find((entry) => entry.notionId === object.id);
          if (ownEntry && (ownEntry.outcome === 'created' || ownEntry.outcome === 'updated')) {
            writtenPageIds.add(object.id);
          }
        }
      } catch (error) {
        pushReport(context, {
          notionId: id,
          notionType: object.object === 'database' ? 'database' : 'page',
          title:
            object.object === 'database'
              ? (object.title?.map((segment) => segment.plain_text).join('') ?? 'Untitled')
              : titleOf(object.properties),
          outcome: 'failed',
          thothContainerId: null,
          detail: redactSecrets(error instanceof Error ? error.message : String(error)),
        });
      }

      for (const child of discovered) {
        parentThothIdByNotionId.set(child.id, context.state.mappings[id]?.thothContainerId ?? thothParentId);
        queue.push({ id: child.id, parentNotionId: id });
      }
    }

    await resolveLinks(context, writtenPageIds);

    const { stats } = state.lastRun;
    state.lastRun.state = stats.failed > 0 || stats.skippedConflict > 0 ? 'partially_completed' : 'completed';
  } catch (error) {
    state.lastRun.state = 'failed';
    state.lastRun.error = redactSecrets(error instanceof Error ? error.message : String(error));
  }

  state.lastRun.finishedAt = new Date().toISOString();

  const exitCode =
    state.lastRun.state === 'completed' ? 0 : (state.lastRun.state === 'partially_completed' ? 1 : 2);
  return { exitCode, state };
}
