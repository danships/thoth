import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import nodePath from 'node:path';
import {
  filterContainersByGrant,
  getContainerRepository,
  getWorkspaceRepository,
  type AccessGrant,
  type DataSourceContainer,
  type PageContainer,
} from '@thoth/database';
import { env as transformersEnv } from '@huggingface/transformers';
import type { Logger } from 'winston';
import {
  LocalDocumentIndex,
  ProtobufCodec,
  TransformersEmbeddings,
  type EmbeddingsResponse,
  type Tokenizer,
} from 'vectra';
import { buildPageSearchDocument, isPageSearchEligible } from './page-document.js';

const INDEX_BATCH_SIZE = 50;
const CHUNK_SIZE = 500;
const INDEX_NAME = 'index.pb';
const CHUNKING_CONFIG = { chunkSize: 256, chunkOverlap: 32, keepSeparators: true } as const;
const MAX_SNIPPET_CHARS = 1000;

type SearchCursor = { createdAt: string; id: string };

type SearchDocumentMetadata = {
  pageId: string;
  workspaceId: string;
  lastUpdated: string;
  dataSourceLastUpdated: string | null;
};

type SearchResult = { pageId: string; score: number; snippet: string };

type EmbeddingsLike = {
  createEmbeddings(inputs: string | string[]): Promise<EmbeddingsResponse>;
  maxTokens?: number;
  getTokenizer?: () => Tokenizer;
};

export type WorkspaceSearchServiceOptions = {
  storageLocalFolder: string;
  modelId: string;
  modelCacheDir: string;
  indexVersion: number;
  logger: Logger;
  embeddings?: EmbeddingsLike;
};

function compareCursor(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }
  return left.id.localeCompare(right.id);
}

function parsePageUri(uri: string): { workspaceId: string; pageId: string } | undefined {
  const match = /^thoth:\/\/workspace\/([^/]+)\/page\/([^/]+)$/.exec(uri);
  return match ? { workspaceId: match[1]!, pageId: match[2]! } : undefined;
}

function parsePageIdFromUri(uri: string): string | undefined {
  return parsePageUri(uri)?.pageId;
}

function isTimestampEqual(expected: string | null, actual: unknown): boolean {
  if (expected === null) {
    return actual === null;
  }
  if (typeof actual !== 'string') {
    return false;
  }
  if (Number.isNaN(Date.parse(actual))) {
    return false;
  }
  return actual === expected;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push([...items.slice(index, index + size)]);
  }
  return chunks;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export class WorkspaceSearchService {
  private readonly storageLocalFolder: string;
  private readonly modelId: string;
  private readonly modelCacheDir: string;
  private readonly indexVersion: number;
  private readonly logger: Logger;
  private readonly embeddingsOverride: EmbeddingsLike | undefined;
  private readonly workspaceLocks = new Map<string, Promise<void>>();
  private readonly workspaceIndexes = new Map<string, LocalDocumentIndex>();
  private embeddingsPromise: Promise<EmbeddingsLike> | undefined;

  constructor(options: WorkspaceSearchServiceOptions) {
    this.storageLocalFolder = options.storageLocalFolder;
    this.modelId = options.modelId;
    this.modelCacheDir = options.modelCacheDir;
    this.indexVersion = options.indexVersion;
    this.logger = options.logger;
    this.embeddingsOverride = options.embeddings;
  }

  public async warmup(): Promise<void> {
    if (this.embeddingsOverride) {
      return;
    }
    const embeddings = await this.getEmbeddings();
    await embeddings.createEmbeddings('warmup');
  }

  public async clearCaches(): Promise<void> {
    this.workspaceIndexes.clear();
    this.workspaceLocks.clear();
    this.embeddingsPromise = undefined;
  }

  public async syncPage(options: {
    workspaceId: string;
    pageId: string;
    force?: boolean;
  }): Promise<'created' | 'updated' | 'skipped' | 'deleted'> {
    return this.withWorkspaceLock(options.workspaceId, async () => {
      const startedAt = Date.now();
      const result = await this.syncPageUnlocked(options);
      this.logger.info('search.index.sync', {
        workspaceId: options.workspaceId,
        pageId: options.pageId,
        result,
        durationMs: Date.now() - startedAt,
      });
      return result;
    });
  }

  public async reconcileWorkspace(
    workspaceId: string,
    cursor?: SearchCursor
  ): Promise<{ nextCursor?: SearchCursor; created: number; updated: number; skipped: number; deleted: number }> {
    return this.withWorkspaceLock(workspaceId, async () => {
      const startedAt = Date.now();
      const result = await this.reconcileWorkspaceUnlocked(workspaceId, cursor);
      this.logger.info('search.index.reconcile', {
        workspaceId,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        deleted: result.deleted,
        durationMs: Date.now() - startedAt,
        hasMore: result.nextCursor !== undefined,
      });
      return result;
    });
  }

  public async search(options: {
    workspaceId: string;
    query: string;
    limit: number;
    grant: AccessGrant;
  }): Promise<SearchResult[]> {
    return this.withWorkspaceLock(options.workspaceId, async () => {
      const startedAt = Date.now();
      const result = await this.searchUnlocked(options);
      this.logger.info('search.query.completed', {
        workspaceId: options.workspaceId,
        resultCount: result.length,
        durationMs: Date.now() - startedAt,
      });
      return result;
    });
  }

  public async deleteWorkspaceIndex(workspaceId: string): Promise<void> {
    await this.withWorkspaceLock(workspaceId, async () => {
      await this.deleteWorkspaceIndexUnlocked(workspaceId);
      this.logger.info('search.index.delete', { workspaceId });
    });
  }

  private async withWorkspaceLock<T>(workspaceId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.workspaceLocks.get(workspaceId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.workspaceLocks.set(workspaceId, previous.catch(() => undefined).then(() => current));

    await previous.catch(() => undefined);
    try {
      return await action();
    } finally {
      release?.();
      if (this.workspaceLocks.get(workspaceId) === current) {
        this.workspaceLocks.delete(workspaceId);
      }
    }
  }

  private async syncPageUnlocked(options: {
    workspaceId: string;
    pageId: string;
    force?: boolean;
  }): Promise<'created' | 'updated' | 'skipped' | 'deleted'> {
    const containerRepository = await getContainerRepository();
    const page = (await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('workspaceId', options.workspaceId).eq('id', options.pageId)
    )) as PageContainer | undefined;

    if (!page || !isPageSearchEligible(page)) {
      await this.deleteDocumentIfIndexExistsUnlocked(options.workspaceId, options.pageId);
      return 'deleted';
    }

    const dataSource = await this.loadParentDataSource(page);
    const index = await this.ensureWorkspaceIndexUnlocked(options.workspaceId);
    const metadata = await this.loadStoredMetadata(index, this.pageUri(options.workspaceId, options.pageId));
    const dataSourceLastUpdated = dataSource?.lastUpdated ?? null;

    if (
      !options.force &&
      metadata &&
      isTimestampEqual(page.lastUpdated, metadata.lastUpdated) &&
      isTimestampEqual(dataSourceLastUpdated, metadata.dataSourceLastUpdated)
    ) {
      return 'skipped';
    }

    return this.upsertResolvedPageUnlocked(index, page, dataSource);
  }

  private async reconcileWorkspaceUnlocked(
    workspaceId: string,
    cursor?: SearchCursor,
    targetIndex?: LocalDocumentIndex
  ): Promise<{ nextCursor?: SearchCursor; created: number; updated: number; skipped: number; deleted: number }> {
    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspaceId));
    if (!workspace || workspace.deletedAt !== null) {
      if (!targetIndex) {
        await this.deleteWorkspaceIndexUnlocked(workspaceId);
      }
      return { created: 0, updated: 0, skipped: 0, deleted: 0 };
    }

    const index = targetIndex ?? (await this.ensureWorkspaceIndexUnlocked(workspaceId));
    const containerRepository = await getContainerRepository();
    const pages = (await containerRepository.getByQuery(
      containerRepository.createQuery().eq('workspaceId', workspaceId).eq('type', 'page')
    )) as PageContainer[];
    pages.sort(compareCursor);

    const startIndex = cursor ? pages.findIndex((page) => compareCursor(page, cursor) > 0) : 0;
    const normalizedStartIndex = startIndex === -1 ? pages.length : startIndex;
    const batch = pages.slice(normalizedStartIndex, normalizedStartIndex + INDEX_BATCH_SIZE);

    const parentIds = [...new Set(batch.map((page) => page.parentId).filter((parentId): parentId is string => Boolean(parentId)))];
    const parentDataSources = new Map<string, DataSourceContainer>();
    if (parentIds.length > 0) {
      const parents = await containerRepository.getByQuery(containerRepository.createQuery().in('id', parentIds));
      for (const parent of parents) {
        if (parent.workspaceId === workspaceId && parent.type === 'data-source') {
          parentDataSources.set(parent.id, parent as DataSourceContainer);
        }
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deleted = 0;

    for (const page of batch) {
      if (!isPageSearchEligible(page)) {
        await index.deleteDocument(this.pageUri(workspaceId, page.id));
        deleted += 1;
        continue;
      }

      const dataSource = page.parentId ? parentDataSources.get(page.parentId) : undefined;
      const metadata = await this.loadStoredMetadata(index, this.pageUri(workspaceId, page.id));
      const dataSourceLastUpdated = dataSource?.lastUpdated ?? null;

      if (
        metadata &&
        isTimestampEqual(page.lastUpdated, metadata.lastUpdated) &&
        isTimestampEqual(dataSourceLastUpdated, metadata.dataSourceLastUpdated)
      ) {
        skipped += 1;
        continue;
      }

      const result = await this.upsertResolvedPageUnlocked(index, page, dataSource);
      if (result === 'created') {
        created += 1;
      } else {
        updated += 1;
      }
    }

    const hasMore = normalizedStartIndex + batch.length < pages.length;
    const nextCursor = hasMore && batch.length > 0 ? { createdAt: batch.at(-1)!.createdAt, id: batch.at(-1)!.id } : undefined;

    if (!nextCursor) {
      deleted += await this.deleteStaleDocumentsUnlocked(workspaceId, index);
    }

    return nextCursor ? { nextCursor, created, updated, skipped, deleted } : { created, updated, skipped, deleted };
  }

  private async searchUnlocked(options: {
    workspaceId: string;
    query: string;
    limit: number;
    grant: AccessGrant;
  }): Promise<SearchResult[]> {
    if (options.grant.workspaceId !== options.workspaceId) {
      throw new Error('Search grant workspace does not match requested workspace');
    }

    const containerRepository = await getContainerRepository();
    const pages = (await containerRepository.getByQuery(
      containerRepository.createQuery().eq('workspaceId', options.workspaceId).eq('type', 'page')
    )) as PageContainer[];
    const allowedPages = await filterContainersByGrant(
      options.grant,
      pages.filter((page) => isPageSearchEligible(page))
    );
    if (allowedPages.length === 0) {
      return [];
    }

    if (!(await pathExists(this.getWorkspaceIndexDir(options.workspaceId)))) {
      await this.reconcileWorkspaceFullyUnlocked(options.workspaceId);
    }

    const index = await this.ensureWorkspaceIndexUnlocked(options.workspaceId);
    const results = (await index.queryDocuments(options.query, {
      maxDocuments: options.limit,
      maxChunks: Math.min(options.limit * 5, 100),
      filter: { pageId: { $in: allowedPages.map((page) => page.id) } },
    })) as Array<{ uri: string; score: number; renderSections(maxTokens: number, maxSections: number, overlappingChunks?: boolean): Promise<Array<{ text: string }>>; loadText(): Promise<string>; loadMetadata(): Promise<Record<string, unknown>> }>;

    const searchResults: SearchResult[] = [];
    for (const result of results) {
      const pageId = parsePageIdFromUri(result.uri);
      if (!pageId) {
        continue;
      }
      searchResults.push({
        pageId,
        score: result.score,
        snippet: await this.buildSnippet(result),
      });
    }

    return searchResults;
  }

  private async reconcileWorkspaceFullyUnlocked(workspaceId: string, targetIndex?: LocalDocumentIndex): Promise<void> {
    let cursor: SearchCursor | undefined;
    do {
      const result = await this.reconcileWorkspaceUnlocked(workspaceId, cursor, targetIndex);
      cursor = result.nextCursor;
    } while (cursor);
  }

  private async deleteStaleDocumentsUnlocked(workspaceId: string, index: LocalDocumentIndex): Promise<number> {
    const documents = await index.listDocuments();
    const pageIds = new Set<string>();

    for (const document of documents) {
      const pageId = parsePageIdFromUri(document.uri);
      if (pageId) {
        pageIds.add(pageId);
      }
    }

    const containerRepository = await getContainerRepository();
    const pagesById = new Map<string, PageContainer>();
    for (const ids of chunkArray([...pageIds], CHUNK_SIZE)) {
      const rows = (await containerRepository.getByQuery(
        containerRepository.createQuery().eq('workspaceId', workspaceId).in('id', ids)
      )) as PageContainer[];
      for (const row of rows) {
        pagesById.set(row.id, row);
      }
    }

    let deleted = 0;
    for (const document of documents) {
      const pageId = parsePageIdFromUri(document.uri);
      const page = pageId ? pagesById.get(pageId) : undefined;
      if (!page || !isPageSearchEligible(page)) {
        await index.deleteDocument(document.uri);
        deleted += 1;
      }
    }

    return deleted;
  }

  private async upsertResolvedPageUnlocked(
    index: LocalDocumentIndex,
    page: PageContainer,
    dataSource?: DataSourceContainer
  ): Promise<'created' | 'updated'> {
    const uri = this.pageUri(page.workspaceId, page.id);
    const existingDocumentId = await index.getDocumentId(uri);
    const document = await buildPageSearchDocument(page, dataSource);
    await index.upsertDocument(
      uri,
      document,
      'markdown',
      {
        pageId: page.id,
        workspaceId: page.workspaceId,
        lastUpdated: page.lastUpdated,
        ...(dataSource?.lastUpdated ? { dataSourceLastUpdated: dataSource.lastUpdated } : {}),
      },
      { force: true }
    );
    return existingDocumentId ? 'updated' : 'created';
  }

  private async loadParentDataSource(page: PageContainer): Promise<DataSourceContainer | undefined> {
    if (!page.parentId) {
      return undefined;
    }
    const containerRepository = await getContainerRepository();
    const parent = await containerRepository.getOneByQuery(
      containerRepository.createQuery().eq('workspaceId', page.workspaceId).eq('id', page.parentId)
    );
    return parent?.type === 'data-source' ? (parent as DataSourceContainer) : undefined;
  }

  private async deleteDocumentIfIndexExistsUnlocked(workspaceId: string, pageId: string): Promise<void> {
    if (!(await pathExists(this.getWorkspaceIndexDir(workspaceId)))) {
      return;
    }
    const index = await this.ensureWorkspaceIndexUnlocked(workspaceId);
    await index.deleteDocument(this.pageUri(workspaceId, pageId));
  }

  private async deleteWorkspaceIndexUnlocked(workspaceId: string): Promise<void> {
    const liveDirectory = this.getWorkspaceIndexDir(workspaceId);
    const cached = this.workspaceIndexes.get(workspaceId);
    this.workspaceIndexes.delete(workspaceId);

    if (!(await pathExists(liveDirectory))) {
      return;
    }

    if (cached) {
      await cached.deleteIndex();
      return;
    }

    const index = await this.createIndexInstance(liveDirectory);
    await index.deleteIndex();
  }

  private async ensureWorkspaceIndexUnlocked(workspaceId: string): Promise<LocalDocumentIndex> {
    const cached = this.workspaceIndexes.get(workspaceId);
    if (cached) {
      return cached;
    }

    const liveDirectory = this.getWorkspaceIndexDir(workspaceId);
    if (!(await pathExists(liveDirectory))) {
      const index = await this.createIndexInstance(liveDirectory);
      await index.createIndex({ version: this.indexVersion, metadata_config: { indexed: ['pageId', 'workspaceId', 'lastUpdated', 'dataSourceLastUpdated'] } });
      this.workspaceIndexes.set(workspaceId, index);
      return index;
    }

    try {
      const index = await this.createIndexInstance(liveDirectory);
      const stats = await index.getIndexStats();
      if (stats.version !== this.indexVersion) {
        await this.moveAsideCorruptIndex(workspaceId, `version mismatch (${stats.version})`);
        return this.rebuildWorkspaceIndexUnlocked(workspaceId);
      }
      this.workspaceIndexes.set(workspaceId, index);
      return index;
    } catch (error) {
      await this.moveAsideCorruptIndex(workspaceId, error instanceof Error ? error.message : 'unknown error');
      return this.rebuildWorkspaceIndexUnlocked(workspaceId);
    }
  }

  private async rebuildWorkspaceIndexUnlocked(workspaceId: string): Promise<LocalDocumentIndex> {
    const liveDirectory = this.getWorkspaceIndexDir(workspaceId);
    const stagingDirectory = this.getWorkspaceStagingDir(workspaceId);
    await mkdir(nodePath.dirname(stagingDirectory), { recursive: true });

    const stagingIndex = await this.createIndexInstance(stagingDirectory);
    await stagingIndex.createIndex({ version: this.indexVersion, metadata_config: { indexed: ['pageId', 'workspaceId', 'lastUpdated', 'dataSourceLastUpdated'] } });
    await this.reconcileWorkspaceFullyUnlocked(workspaceId, stagingIndex);

    let backupDirectory: string | undefined;
    if (await pathExists(liveDirectory)) {
      backupDirectory = `${liveDirectory}-backup-${Date.now()}`;
      await rename(liveDirectory, backupDirectory);
    }

    try {
      await rename(stagingDirectory, liveDirectory);
    } catch (error) {
      if (backupDirectory && !(await pathExists(liveDirectory)) && (await pathExists(backupDirectory))) {
        await rename(backupDirectory, liveDirectory);
      }
      throw error;
    }

    if (backupDirectory) {
      await rm(backupDirectory, { recursive: true, force: true });
    }

    const liveIndex = await this.createIndexInstance(liveDirectory);
    this.workspaceIndexes.set(workspaceId, liveIndex);
    return liveIndex;
  }

  private async moveAsideCorruptIndex(workspaceId: string, message: string): Promise<void> {
    const liveDirectory = this.getWorkspaceIndexDir(workspaceId);
    this.workspaceIndexes.delete(workspaceId);
    if (!(await pathExists(liveDirectory))) {
      return;
    }
    this.logger.warn('search.index.corrupt', { workspaceId, message });
    await rename(liveDirectory, `${liveDirectory}-corrupt-${Date.now()}`);
  }

  private async createIndexInstance(folderPath: string): Promise<LocalDocumentIndex> {
    const embeddings = await this.getEmbeddings();
    return new LocalDocumentIndex({
      folderPath,
      indexName: INDEX_NAME,
      embeddings: {
        maxTokens: embeddings.maxTokens ?? 512,
        createEmbeddings: embeddings.createEmbeddings.bind(embeddings),
      },
      ...(embeddings.getTokenizer ? { tokenizer: embeddings.getTokenizer() } : {}),
      codec: new ProtobufCodec(),
      chunkingConfig: CHUNKING_CONFIG,
    });
  }

  private async getEmbeddings(): Promise<EmbeddingsLike> {
    if (this.embeddingsOverride) {
      return this.embeddingsOverride;
    }
    if (!this.embeddingsPromise) {
      this.embeddingsPromise = (async () => {
        transformersEnv.cacheDir = this.modelCacheDir;
        transformersEnv.allowRemoteModels = false;
        return TransformersEmbeddings.create({
          model: this.modelId,
          device: 'cpu',
          dtype: 'q8',
          pooling: 'mean',
          normalize: true,
        });
      })();
    }
    return this.embeddingsPromise;
  }

  private async loadStoredMetadata(index: LocalDocumentIndex, uri: string): Promise<SearchDocumentMetadata | undefined> {
    const parsed = parsePageUri(uri);
    if (!parsed) {
      return undefined;
    }
    const items = await index.listItemsByMetadata({
      $and: [
        { pageId: { $eq: parsed.pageId } },
        { workspaceId: { $eq: parsed.workspaceId } },
      ],
    });
    return this.normalizeMetadata((items[0]?.metadata ?? {}) as Record<string, unknown>);
  }

  private normalizeMetadata(metadata: Record<string, unknown>): SearchDocumentMetadata | undefined {
    if (
      typeof metadata['pageId'] !== 'string' ||
      typeof metadata['workspaceId'] !== 'string' ||
      typeof metadata['lastUpdated'] !== 'string'
    ) {
      return undefined;
    }
    return {
      pageId: metadata['pageId'],
      workspaceId: metadata['workspaceId'],
      lastUpdated: metadata['lastUpdated'],
      dataSourceLastUpdated: typeof metadata['dataSourceLastUpdated'] === 'string' ? metadata['dataSourceLastUpdated'] : null,
    };
  }

  private async buildSnippet(result: {
    renderSections(maxTokens: number, maxSections: number, overlappingChunks?: boolean): Promise<Array<{ text: string }>>;
    loadText(): Promise<string>;
  }): Promise<string> {
    const sections = await result.renderSections(128, 3, true);
    const text = (sections.length > 0 ? sections.map((section) => section.text).join('\n\n...\n\n') : await result.loadText()).trim();
    return text.length <= MAX_SNIPPET_CHARS ? text : `${text.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
  }

  private getSearchRoot(): string {
    return nodePath.resolve(this.storageLocalFolder, '_search');
  }

  private getWorkspaceIndexDir(workspaceId: string): string {
    return this.resolveWorkspaceScopedPath(workspaceId, this.getSearchRoot());
  }

  private getWorkspaceStagingDir(workspaceId: string): string {
    const stagingRoot = nodePath.resolve(this.getSearchRoot(), '.staging');
    return this.resolveWorkspaceScopedPath(`${workspaceId}-${randomUUID()}`, stagingRoot);
  }

  private resolveWorkspaceScopedPath(segment: string, root: string): string {
    const resolvedRoot = nodePath.resolve(root);
    const resolvedPath = nodePath.resolve(root, segment);
    if (resolvedPath === resolvedRoot || !resolvedPath.startsWith(`${resolvedRoot}${nodePath.sep}`)) {
      throw new Error(`Workspace search path escapes search root for ${segment}`);
    }
    return resolvedPath;
  }

  private pageUri(workspaceId: string, pageId: string): string {
    return `thoth://workspace/${workspaceId}/page/${pageId}`;
  }
}

export function createWorkspaceSearchService(options: WorkspaceSearchServiceOptions): WorkspaceSearchService {
  return new WorkspaceSearchService(options);
}
