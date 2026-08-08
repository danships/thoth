import { describe, it, expect } from 'vitest';
import {
  runImport,
  type NotionClientLike,
  type ThothClientLike,
  type NotionPageLike,
  type NotionDatabaseLike,
  type NotionBlockLike,
} from './index';
import { loadConfig } from './config';
import type { StateFile } from './types';
import { createEmptyStats } from './types';
import type { PrimitiveColumnInput, ThothPageValue } from './thoth-client';

const BASE_ENV = {
  NOTION_TOKEN: 'secret_abc',
  THOTH_API_URL: 'https://thoth.example.com/api/v1',
  THOTH_API_KEY: 'thk_xyz',
  THOTH_WORKSPACE_ID: 'ws_123',
  STATE_FILE: './unused-in-tests.json',
};

// --- Fake Notion client -----------------------------------------------------------------------

class FakeNotionClient implements NotionClientLike {
  pages = new Map<string, NotionPageLike>();
  databases = new Map<string, NotionDatabaseLike>();
  blockChildren = new Map<string, NotionBlockLike[]>();
  rows = new Map<string, NotionPageLike[]>();
  rootIds: string[] = [];

  async validateTokenAndGetWorkspaceId(): Promise<string | null> {
    return 'notion-workspace-1';
  }

  async fetchRoots(explicitRootIds: string[] | null): Promise<(NotionPageLike | NotionDatabaseLike)[]> {
    const ids = explicitRootIds ?? this.rootIds;
    const results: (NotionPageLike | NotionDatabaseLike)[] = [];
    for (const id of ids) {
      const object = await this.retrieve(id);
      if (object) results.push(object);
    }
    return results;
  }

  async listBlockChildren(blockId: string): Promise<NotionBlockLike[]> {
    return this.blockChildren.get(blockId) ?? [];
  }

  async queryDatabaseRows(dataSourceId: string): Promise<NotionPageLike[]> {
    return this.rows.get(dataSourceId) ?? [];
  }

  async retrieve(id: string): Promise<NotionPageLike | NotionDatabaseLike | null> {
    return this.pages.get(id) ?? this.databases.get(id) ?? null;
  }
}

// --- Fake Thoth client -------------------------------------------------------------------------

class FakeThothClient implements ThothClientLike {
  pageContent = new Map<string, string>();
  pageValues = new Map<string, Record<string, ThothPageValue>>();
  nextId = 1;
  calls: string[] = [];
  shouldFailValidation = false;

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  async validateConnection(): Promise<void> {
    if (this.shouldFailValidation) {
      throw new Error('invalid API key');
    }
  }

  async createPage(_input: { name: string }): Promise<{ id: string }> {
    this.calls.push('createPage');
    const id = this.id('page');
    this.pageContent.set(id, '');
    this.pageValues.set(id, {});
    return { id };
  }

  async getPageContent(pageId: string): Promise<string> {
    this.calls.push('getPageContent');
    return this.pageContent.get(pageId) ?? '';
  }

  async setPageContent(pageId: string, content: string): Promise<void> {
    this.calls.push('setPageContent');
    this.pageContent.set(pageId, content);
  }

  async getPageValues(pageId: string): Promise<Record<string, ThothPageValue>> {
    this.calls.push('getPageValues');
    return this.pageValues.get(pageId) ?? {};
  }

  async updatePageValues(pageId: string, values: Record<string, ThothPageValue>): Promise<void> {
    this.calls.push('updatePageValues');
    this.pageValues.set(pageId, values);
  }

  async createDataSource(input: {
    name: string;
    columns?: PrimitiveColumnInput[];
  }): Promise<{ id: string; columns: { id: string; name: string; type: string }[] }> {
    this.calls.push('createDataSource');
    const id = this.id('ds');
    const columns = (input.columns ?? []).map((column) => ({ id: this.id('col'), name: column.name, type: column.type }));
    return { id, columns };
  }

  async addDataSourceColumn(
    _dataSourceId: string,
    input: unknown
  ): Promise<{ id: string; options?: { id: string; label: string }[] }> {
    this.calls.push('addDataSourceColumn');
    const typed = input as { options?: { label: string }[] };
    const options = typed.options?.map((option) => ({ id: this.id('opt'), label: option.label }));
    return options ? { id: this.id('col'), options } : { id: this.id('col') };
  }

  async createDataView(_input: { name: string; dataSourceId: string; pageId?: string; workspaceId?: string }): Promise<{
    id: string;
  }> {
    this.calls.push('createDataView');
    return { id: this.id('view') };
  }

  async uploadFile(): Promise<{ id: string; url: string; filename: string }> {
    this.calls.push('uploadFile');
    return { id: this.id('file'), url: 'https://cdn.example.com/f', filename: 'f' };
  }
}

function notionPage(id: string, title: string, lastEditedTime: string, archived = false): NotionPageLike {
  return {
    id,
    object: 'page',
    archived,
    last_edited_time: lastEditedTime,
    icon: null,
    properties: { Name: { type: 'title', title: [{ plain_text: title }] } },
    parent: { type: 'workspace' },
  };
}

describe('runImport (page lifecycle)', () => {
  it('creates a new page on the initial run', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
    ]);
    notion.rootIds = ['p1'];

    const result = await runImport(config, notion, thoth, null);

    expect(result.exitCode).toBe(0);
    expect(result.state.lastRun.state).toBe('completed');
    expect(result.state.lastRun.stats.created).toBe(1);
    expect(result.state.mappings['p1']?.thothContainerId).toBeDefined();
    const thothPageId = result.state.mappings['p1']!.thothContainerId!;
    expect(thoth.pageContent.get(thothPageId)).toBe('Hello');
  });

  it('skips an unchanged page on the next sync run without any Thoth writes', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
    ]);
    notion.rootIds = ['p1'];

    const first = await runImport(config, notion, thoth, null);
    thoth.calls = [];
    const second = await runImport(config, notion, thoth, first.state);

    expect(second.state.lastRun.mode).toBe('sync');
    expect(second.state.lastRun.stats.skippedUnchanged).toBe(1);
    expect(second.state.lastRun.stats.created).toBe(0);
    expect(thoth.calls).toEqual([]);
  });

  it('updates a page whose Notion content changed and Thoth copy is untouched', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
    ]);
    notion.rootIds = ['p1'];

    const first = await runImport(config, notion, thoth, null);

    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-02-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Updated' }] } },
    ]);

    const second = await runImport(config, notion, thoth, first.state);

    expect(second.state.lastRun.stats.updated).toBe(1);
    const thothPageId = second.state.mappings['p1']!.thothContainerId!;
    expect(thoth.pageContent.get(thothPageId)).toBe('Updated');
  });

  it('flags a conflict — never overwriting — when the Thoth copy was edited locally', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
    ]);
    notion.rootIds = ['p1'];

    const first = await runImport(config, notion, thoth, null);
    const thothPageId = first.state.mappings['p1']!.thothContainerId!;
    // Simulate a human editing the Thoth page directly.
    thoth.pageContent.set(thothPageId, 'Hello (edited by a human in Thoth)');

    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-02-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Notion update' }] } },
    ]);

    const second = await runImport(config, notion, thoth, first.state);

    expect(second.state.lastRun.stats.skippedConflict).toBe(1);
    expect(second.state.lastRun.state).toBe('partially_completed');
    expect(second.exitCode).toBe(1);
    // The human edit must survive untouched.
    expect(thoth.pageContent.get(thothPageId)).toBe('Hello (edited by a human in Thoth)');
  });

  it('keeps the Thoth copy when a page is archived/deleted in Notion (never mirrors deletions)', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', []);
    notion.rootIds = ['p1'];

    const first = await runImport(config, notion, thoth, null);
    const thothPageId = first.state.mappings['p1']!.thothContainerId!;

    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-02-01T00:00:00.000Z', true));
    const second = await runImport(config, notion, thoth, first.state);

    expect(second.state.mappings['p1']?.deletedInNotion).toBe(true);
    expect(second.state.mappings['p1']?.thothContainerId).toBe(thothPageId);
    expect(thoth.pageContent.has(thothPageId)).toBe(true);
  });

  it('performs no writes in dry-run mode', async () => {
    const config = loadConfig({ ...BASE_ENV, DRY_RUN: 'true' });
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
    ]);
    notion.rootIds = ['p1'];

    const result = await runImport(config, notion, thoth, null);

    expect(thoth.calls).toEqual([]);
    expect(result.state.mappings['p1']).toBeUndefined();
    // The dry-run preview must still reflect what *would* have been created, not just "no writes
    // happened" — otherwise DRY_RUN is useless as a preview.
    const previewEntry = result.state.lastRun.report.find((entry) => entry.notionId === 'p1');
    expect(previewEntry?.outcome).toBe('created');
    expect(previewEntry?.title).toBe('My Page');
  });

  it('exits 2 and marks the run failed when Thoth connection validation fails', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    thoth.shouldFailValidation = true;

    const result = await runImport(config, notion, thoth, null);

    expect(result.exitCode).toBe(2);
    expect(result.state.lastRun.state).toBe('failed');
    expect(result.state.lastRun.error).toContain('invalid API key');
  });
});

function notionDatabase(id: string, title: string, lastEditedTime: string): NotionDatabaseLike {
  return {
    id,
    object: 'database',
    last_edited_time: lastEditedTime,
    title: [{ plain_text: title }],
    dataSourceId: id,
    properties: {
      Name: { id: 'p1', name: 'Name', type: 'title' },
      Status: {
        id: 'p2',
        name: 'Status',
        type: 'select',
        select: { options: [{ name: 'Open', color: 'green' }] },
      },
    },
  };
}

describe('runImport (database lifecycle)', () => {
  it('creates a data source with a two-step column flow and imports rows with mapped select ids', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-01-01T00:00:00.000Z'));
    notion.rootIds = ['db1'];
    notion.rows.set('db1', [
      {
        id: 'row1',
        object: 'page',
        last_edited_time: '2026-01-01T00:00:00.000Z',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Task 1' }] },
          Status: { type: 'select', select: { name: 'Open' } },
        },
        parent: { type: 'data_source' },
      },
    ]);

    const result = await runImport(config, notion, thoth, null);

    expect(result.exitCode).toBe(0);
    expect(thoth.calls).toContain('createDataSource');
    expect(thoth.calls).toContain('addDataSourceColumn');
    const databaseMapping = result.state.mappings['db1']!;
    expect(databaseMapping.thothContainerId).toBeDefined();
    expect(databaseMapping.columnMappings?.['Status']?.optionIdsByLabel?.['Open']).toBeDefined();

    const rowMapping = result.state.mappings['row1']!;
    const values = thoth.pageValues.get(rowMapping.thothContainerId!)!;
    const statusColumnId = databaseMapping.columnMappings!['Status']!.thothColumnId;
    expect(values[statusColumnId]).toEqual({
      type: 'single-select',
      value: databaseMapping.columnMappings!['Status']!.optionIdsByLabel!['Open'],
    });
  });

  it('reuses the persisted column mappings on a second run and applies the mapped row update', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-01-01T00:00:00.000Z'));
    notion.rootIds = ['db1'];
    notion.rows.set('db1', [
      {
        id: 'row1',
        object: 'page',
        last_edited_time: '2026-01-01T00:00:00.000Z',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Task 1' }] },
          Status: { type: 'select', select: { name: 'Open' } },
        },
        parent: { type: 'data_source' },
      },
    ]);

    const first = await runImport(config, notion, thoth, null);
    thoth.calls = [];

    // Advance both the database's and the row's last_edited_time so the second run has to
    // re-sync the database (picking up its persisted column mappings, not re-creating them) and
    // re-check the row (picking up the new Status value).
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-02-01T00:00:00.000Z'));
    notion.rows.set('db1', [
      {
        id: 'row1',
        object: 'page',
        last_edited_time: '2026-02-01T00:00:00.000Z',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Task 1' }] },
          Status: { type: 'select', select: { name: 'Open' } },
        },
        parent: { type: 'data_source' },
      },
    ]);

    const second = await runImport(config, notion, thoth, first.state);

    expect(second.exitCode).toBe(0);
    // The data source's columns must not be re-created on an update — only the row is touched.
    expect(thoth.calls).not.toContain('createDataSource');
    expect(thoth.calls).not.toContain('addDataSourceColumn');
    expect(thoth.calls).toContain('updatePageValues');

    const databaseMapping = second.state.mappings['db1']!;
    const rowMapping = second.state.mappings['row1']!;
    const statusColumnId = databaseMapping.columnMappings!['Status']!.thothColumnId;
    const values = thoth.pageValues.get(rowMapping.thothContainerId!)!;
    // The update must carry the mapped single-select Status value through — not an empty object,
    // which would indicate the persisted column mappings were lost/ignored on this path.
    expect(values[statusColumnId]).toEqual({
      type: 'single-select',
      value: databaseMapping.columnMappings!['Status']!.optionIdsByLabel!['Open'],
    });
  });

  it('imports a database row Markdown body (block content), not just its column values', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-01-01T00:00:00.000Z'));
    notion.rootIds = ['db1'];
    notion.rows.set('db1', [
      {
        id: 'row1',
        object: 'page',
        last_edited_time: '2026-01-01T00:00:00.000Z',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Task 1' }] },
          Status: { type: 'select', select: { name: 'Open' } },
        },
        parent: { type: 'data_source' },
      },
    ]);
    notion.blockChildren.set('row1', [
      {
        id: 'block1',
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Some body content', href: null, annotations: {} }] },
      },
    ]);

    const result = await runImport(config, notion, thoth, null);

    expect(result.exitCode).toBe(0);
    expect(thoth.calls).toContain('setPageContent');
    const rowMapping = result.state.mappings['row1']!;
    expect(rowMapping.rowContentSynced).toBe(true);
    expect(thoth.pageContent.get(rowMapping.thothContainerId!)).toContain('Some body content');
  });

  it('self-heals a row mapping created before row body content was imported', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-01-01T00:00:00.000Z'));
    notion.rootIds = ['db1'];
    const row: NotionPageLike = {
      id: 'row1',
      object: 'page',
      last_edited_time: '2026-01-01T00:00:00.000Z',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Task 1' }] },
        Status: { type: 'select', select: { name: 'Open' } },
      },
      parent: { type: 'data_source' },
    };
    notion.rows.set('db1', [row]);
    notion.blockChildren.set('row1', [
      {
        id: 'block1',
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Backfilled body', href: null, annotations: {} }] },
      },
    ]);

    // Simulate a pre-existing state file written by an older version of the script, before row
    // body content was imported at all: a valid mapping with no `rowContentSynced` field and no
    // change in `notionLastEditedTime` (so the row is otherwise "unchanged").
    thoth.pageContent.set('page-1', '');
    thoth.pageValues.set('page-1', {});
    const priorState: StateFile = {
      version: 1,
      connection: { notionWorkspaceId: 'notion-workspace-1', thothWorkspaceId: 'ws_123', targetParentId: null },
      mappings: {
        db1: {
          notionType: 'database',
          thothContainerId: 'ds-1',
          thothColumnId: null,
          notionLastEditedTime: '2026-01-01T00:00:00.000Z',
          importedContentHash: 'irrelevant',
          deletedInNotion: false,
          columnMappings: {
            Name: { thothColumnId: 'col-name', type: 'string' },
            Status: { thothColumnId: 'col-status', type: 'single-select', optionIdsByLabel: { Open: 'opt-open' } },
          },
        },
        row1: {
          notionType: 'database_row',
          thothContainerId: 'page-1',
          thothColumnId: null,
          notionLastEditedTime: '2026-01-01T00:00:00.000Z',
          importedContentHash: 'irrelevant',
          deletedInNotion: false,
        },
      },
      lastRun: {
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        mode: 'initial',
        dryRun: false,
        state: 'completed',
        stats: createEmptyStats(),
        error: null,
        report: [],
      },
    };

    const result = await runImport(config, notion, thoth, priorState);

    expect(result.exitCode).toBe(0);
    expect(thoth.calls).toContain('setPageContent');
    expect(thoth.pageContent.get('page-1')).toContain('Backfilled body');
    expect(result.state.mappings['row1']!.rowContentSynced).toBe(true);
    // Self-heal must not disturb the value-conflict-detection hash the row was already tracking.
    expect(result.state.mappings['row1']!.importedContentHash).toBe('irrelevant');
  });

  it('creates a wrapping page with a linked data view so the database is navigable', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-01-01T00:00:00.000Z'));
    notion.rootIds = ['db1'];

    const result = await runImport(config, notion, thoth, null);

    expect(result.exitCode).toBe(0);
    expect(thoth.calls).toContain('createDataView');
    const databaseMapping = result.state.mappings['db1']!;
    expect(databaseMapping.thothViewPageId).toBeDefined();
    // The wrapping page must be a distinct container from the data source itself — a data
    // source has no page of its own and isn't independently navigable.
    expect(databaseMapping.thothViewPageId).not.toBe(databaseMapping.thothContainerId);
  });

  it('self-heals a mapping created before wrapping pages existed, without recreating the data source', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.databases.set('db1', notionDatabase('db1', 'Tasks', '2026-01-01T00:00:00.000Z'));
    notion.rootIds = ['db1'];

    // Simulate a mapping produced by an older version of this script that never created a
    // wrapping page: same last_edited_time as the source (so the next run treats it as
    // unchanged), no `thothViewPageId`.
    const legacyState: StateFile = {
      version: 1,
      connection: { notionWorkspaceId: 'notion-workspace-1', thothWorkspaceId: config.thothWorkspaceId, targetParentId: null },
      mappings: {
        db1: {
          notionType: 'database',
          thothContainerId: 'ds-legacy',
          thothColumnId: null,
          notionLastEditedTime: '2026-01-01T00:00:00.000Z',
          importedContentHash: 'irrelevant',
          deletedInNotion: false,
          columnMappings: {
            Name: { thothColumnId: 'col-name', type: 'string' },
            Status: { thothColumnId: 'col-status', type: 'single-select', optionIdsByLabel: { Open: 'opt-open' } },
          },
        },
      },
      lastRun: { startedAt: '', finishedAt: null, mode: 'sync', dryRun: false, state: 'completed', error: null, report: [], stats: createEmptyStats() },
    };

    const result = await runImport(config, notion, thoth, legacyState);

    expect(result.exitCode).toBe(0);
    expect(thoth.calls).not.toContain('createDataSource');
    expect(thoth.calls).toContain('createPage');
    expect(thoth.calls).toContain('createDataView');
    const databaseMapping = result.state.mappings['db1']!;
    expect(databaseMapping.thothContainerId).toBe('ds-legacy');
    expect(databaseMapping.thothViewPageId).toBeDefined();
  });
});

describe('runImport (idempotency)', () => {
  it('is idempotent: re-running with unchanged Notion data never duplicates Thoth content', async () => {
    const config = loadConfig(BASE_ENV);
    const notion = new FakeNotionClient();
    const thoth = new FakeThothClient();
    notion.pages.set('p1', notionPage('p1', 'My Page', '2026-01-01T00:00:00.000Z'));
    notion.blockChildren.set('p1', [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ plain_text: 'Hello' }] } },
    ]);
    notion.rootIds = ['p1'];

    let state: StateFile | null = null;
    for (let index = 0; index < 3; index += 1) {
      const result = await runImport(config, notion, thoth, state);
      state = result.state;
    }

    // Only one createPage call across all three runs.
    expect(thoth.calls.filter((call) => call === 'createPage')).toHaveLength(1);
    expect(state!.lastRun.stats.skippedUnchanged).toBe(1);
  });
});
