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
  }): Promise<{ id: string; columns: { id: string; name: string }[] }> {
    this.calls.push('createDataSource');
    const id = this.id('ds');
    const columns = (input.columns ?? []).map((column) => ({ id: this.id('col'), name: column.name }));
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
