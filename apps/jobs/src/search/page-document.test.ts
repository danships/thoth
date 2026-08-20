import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import nodePath from 'node:path';
import {
  createDatabaseContext,
  getUploadedFileRepository,
  resetDatabaseContext,
  setDatabaseContext,
  type DataSourceContainer,
  type PageContainer,
} from '@thoth/database';
import { parse } from 'yaml';
import { buildPageSearchDocument, isPageSearchEligible } from './page-document.js';

describe('page-document', () => {
  let temporaryDirectory = '';
  let uploadedFileRepository: Awaited<ReturnType<typeof getUploadedFileRepository>>;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(process.cwd(), '.page-document-test-'));
    setDatabaseContext(
      createDatabaseContext({ connectionString: `sqlite://${nodePath.join(temporaryDirectory, 'test.db')}`, skipSync: false })
    );
    uploadedFileRepository = await getUploadedFileRepository();
  });

  afterAll(async () => {
    resetDatabaseContext();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  function makeDataSource(): DataSourceContainer {
    return {
      id: 'ds-1',
      name: 'People',
      type: 'data-source',
      parentId: null,
      workspaceId: 'workspace-1',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
      sortOrder: null,
      columns: [
        { id: 'text', name: 'Text', type: 'string' },
        { id: 'num', name: 'Count', type: 'number' },
        { id: 'bool', name: 'Ready', type: 'boolean' },
        { id: 'date', name: 'When', type: 'date', mode: 'datetime', displayFormat: 'YYYY-MM-DD' },
        { id: 'single', name: 'Status', type: 'single-select', options: [{ id: 'open', label: 'Open', color: 'blue' }] },
        {
          id: 'multi',
          name: 'Tags',
          type: 'multi-select',
          options: [
            { id: 'urgent', label: 'Urgent', color: 'red' },
            { id: 'customer', label: 'Customer', color: 'green' },
          ],
        },
        { id: 'file', name: 'Attachment', type: 'file' },
      ],
    };
  }

  function makePage(values?: PageContainer['values']): PageContainer {
    return {
      id: 'page-1',
      name: 'Proposal: "A:B"',
      type: 'page',
      parentId: 'ds-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      emoji: null,
      cover: null,
      content: 'Line one\nLine two: value',
      values: values ?? {},
      views: [],
      sortOrder: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
    };
  }

  function readFrontmatter(document: string): Record<string, unknown> | undefined {
    const match = document.match(/^---\n([\s\S]+?)\n---\n/);
    const frontmatterBlock = match?.[1];
    return frontmatterBlock ? (parse(frontmatterBlock) as Record<string, unknown>) : undefined;
  }

  test('builds frontmatter values for every displayable type and preserves column order', async () => {
    await uploadedFileRepository.create({
      id: 'file-1',
      filename: 'proposal.pdf',
      mimeType: 'application/pdf',
      size: 1,
      extension: 'pdf',
      storageKey: 'workspace-1/file-1',
      storageType: 'local',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      lastUpdated: '2024-01-01T00:00:00.000Z',
    } as unknown as Parameters<typeof uploadedFileRepository.create>[0]);

    const document = await buildPageSearchDocument(
      makePage({
        text: { type: 'string', value: 'Hello: "world"\nsecond line' },
        num: { type: 'number', value: 3 },
        bool: { type: 'boolean', value: true },
        date: { type: 'date', value: '2024-01-02T03:04:05.000Z' },
        single: { type: 'single-select', value: 'open' },
        multi: { type: 'multi-select', value: ['urgent', 'customer'] },
        file: { type: 'file', value: 'file-1' },
      }),
      makeDataSource()
    );

    const parsed = readFrontmatter(document) as { values: Record<string, unknown> };
    expect(Object.keys(parsed.values)).toEqual(['Text', 'Count', 'Ready', 'When', 'Status', 'Tags', 'Attachment']);
    expect(parsed.values).toEqual({
      Text: 'Hello: "world"\nsecond line',
      Count: 3,
      Ready: true,
      When: '2024-01-02T03:04:05.000Z',
      Status: 'Open',
      Tags: ['Urgent', 'Customer'],
      Attachment: 'proposal.pdf',
    });
    expect(document).toContain('# Proposal: "A:B"\n\nLine one\nLine two: value');
  });

  test('suffixes every duplicate column name with its full column id', async () => {
    const dataSource = makeDataSource();
    dataSource.columns = [
      { id: 'dup-a', name: 'Status', type: 'string' },
      { id: 'dup-b', name: 'Status', type: 'string' },
    ];

    const document = await buildPageSearchDocument(
      makePage({
        'dup-a': { type: 'string', value: 'One' },
        'dup-b': { type: 'string', value: 'Two' },
      }),
      dataSource
    );

    const parsed = readFrontmatter(document) as { values: Record<string, unknown> };
    expect(parsed.values).toEqual({
      'Status [dup-a]': 'One',
      'Status [dup-b]': 'Two',
    });
  });

  test('skips stale values, deleted options, and missing files', async () => {
    const document = await buildPageSearchDocument(
      makePage({
        stale: { type: 'string', value: 'ignore me' },
        single: { type: 'single-select', value: 'missing-option' },
        multi: { type: 'multi-select', value: ['missing-option'] },
        file: { type: 'file', value: 'missing-file' },
      }),
      makeDataSource()
    );

    expect(readFrontmatter(document)).toBeUndefined();
  });

  test('omits frontmatter entirely when no displayable values remain', async () => {
    const document = await buildPageSearchDocument(makePage(), makeDataSource());
    expect(document.startsWith('---')).toBe(false);
    expect(document).toBe('# Proposal: "A:B"\n\nLine one\nLine two: value');
  });

  test('isPageSearchEligible matches the private/deleted/non-page truth table', () => {
    expect(isPageSearchEligible({ type: 'page', deletedAt: null, isPrivate: false })).toBe(true);
    expect(isPageSearchEligible({ type: 'page', deletedAt: null })).toBe(true);
    expect(isPageSearchEligible({ type: 'page', deletedAt: null, isPrivate: true })).toBe(false);
    expect(isPageSearchEligible({ type: 'page', deletedAt: '2024-01-01T00:00:00.000Z', isPrivate: false })).toBe(false);
    expect(isPageSearchEligible({ type: 'data-source', deletedAt: null, isPrivate: false })).toBe(false);
  });
});
