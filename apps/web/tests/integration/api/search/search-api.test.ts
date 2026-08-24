import { describe, expect, test, vi, afterEach } from 'vitest';
import { createAnonymousClient, getBaseUrl, getOwnerClient, getThirdUserClient, SEED } from '../../support/fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env['JOB_SOCKET_PATH'];
});

describe('search API auth and validation', () => {
  test('returns 401 without auth', async () => {
    const client = createAnonymousClient(getBaseUrl());
    const response = await client.get('/api/v1/search', {
      params: { workspaceId: SEED.workspace.id, query: 'root', type: 'page', limit: '20' },
    });
    expect(response.status).toBe(401);
  });

  test('returns 404 for a non-member workspace lookup', async () => {
    const client = await getThirdUserClient(getBaseUrl());
    const response = await client.get('/api/v1/search', {
      params: { workspaceId: SEED.secondWorkspace.id, query: 'root', type: 'page', limit: '20' },
    });
    expect(response.status).toBe(404);
  });

  test.each([
    { workspaceId: SEED.workspace.id },
    { workspaceId: SEED.workspace.id, query: ' ', type: 'page', limit: '20' },
    { workspaceId: SEED.workspace.id, query: 'x'.repeat(101), type: 'page', limit: '20' },
    { query: 'root', type: 'page', limit: '20' },
    { workspaceId: SEED.workspace.id, query: 'root', type: 'page', limit: '0' },
    { workspaceId: SEED.workspace.id, query: 'root', type: 'page', limit: '21' },
  ])('returns 400 for invalid query parameters', async (parameters) => {
    const client = await getOwnerClient(getBaseUrl());
    const response = await client.get('/api/v1/search', { params: parameters as Record<string, string> });
    expect(response.status).toBe(400);
  });
});

describe('queryWorkspaceSearchResults', () => {
  async function loadModule(options?: {
    rows?: Array<{
      id: string;
      workspaceId: string;
      type: string;
      name: string;
      emoji: string | null;
      parentId: string | null;
      deletedAt: string | null;
      isPrivate: boolean;
    }>;
    searchResults?: Array<{ pageId: string; score: number; snippet: string }>;
    searchError?: unknown;
    grant?: {
      workspaceId: string;
      permission: 'read' | 'read_write';
      scopeType: 'workspace' | 'containers' | 'containers_with_children';
      scopedContainerIds?: string[];
    };
    denyPageIds?: string[];
  }) {
    const logger = { error: vi.fn() };
    const searchWorkspace = vi.fn();
    const assertContentAccess = vi.fn();
    const { ForbiddenError } = await import('@/lib/errors/forbidden-error');

    const rows = options?.rows ?? [];
    const denyPageIds = new Set(options?.denyPageIds);
    const grant = options?.grant ?? {
      workspaceId: SEED.workspace.id,
      permission: 'read_write' as const,
      scopeType: 'workspace' as const,
    };

    if (options?.searchError) {
      searchWorkspace.mockRejectedValue(options.searchError);
    } else {
      searchWorkspace.mockResolvedValue(options?.searchResults ?? []);
    }

    assertContentAccess.mockImplementation(async (_session, container: { id: string }) => {
      if (denyPageIds.has(container.id)) {
        throw new ForbiddenError('Out of scope');
      }
    });

    vi.doMock('@thoth/job-protocol', () => ({
      searchWorkspace,
    }));
    vi.doMock('@/lib/api/server/workspace-access', () => ({
      assertWorkspaceAccess: vi.fn().mockResolvedValue({ workspaceId: SEED.workspace.id }),
      assertContentAccess,
    }));
    vi.doMock('@/lib/auth/access-grant', () => ({
      memberToAccessGrant: vi.fn().mockResolvedValue(grant),
    }));
    vi.doMock('@/lib/database', () => ({
      getContainerRepository: vi.fn().mockResolvedValue({
        createQuery: () => {
          const filters: Record<string, string> = {};
          const query = {
            filters,
            eq(field: string, value: string) {
              filters[field] = value;
              return query;
            },
          };
          return query;
        },
        getOneByQuery: vi.fn(async (query: { filters: Record<string, string> }) => {
          return (
            rows.find(
              (row) => row.id === query.filters['id'] && row.workspaceId === query.filters['workspaceId']
            ) ?? null
          );
        }),
      }),
    }));
    vi.doMock('@/lib/environment', () => ({
      getEnvironment: vi.fn().mockResolvedValue({ SEARCH_QUERY_TIMEOUT_MS: 1234 }),
    }));
    vi.doMock('@/lib/logger', () => ({
      getLogger: vi.fn().mockResolvedValue(logger),
    }));

    const routeModule = await import('@/app/api/v1/search/route');
    return { ...routeModule, logger, searchWorkspace, assertContentAccess };
  }

  test('returns matched authorized pages, excluding only deleted and denied pages', async () => {
    process.env['JOB_SOCKET_PATH'] = '/workspace/apps/web/test.sock';
    const { queryWorkspaceSearchResults, searchWorkspace, assertContentAccess } = await loadModule({
      rows: [
        {
          id: SEED.pages.root.id,
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: SEED.pages.root.name,
          emoji: null,
          parentId: null,
          deletedAt: null,
          isPrivate: false,
        },
        {
          id: 'title-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Title Match',
          emoji: '📄',
          parentId: null,
          deletedAt: null,
          isPrivate: false,
        },
        {
          id: 'content-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Content Match',
          emoji: null,
          parentId: SEED.pages.root.id,
          deletedAt: null,
          isPrivate: false,
        },
        {
          id: 'value-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Value Match',
          emoji: null,
          parentId: SEED.dataSource.id,
          deletedAt: null,
          isPrivate: false,
        },
        {
          id: 'private-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Private Match',
          emoji: null,
          parentId: null,
          deletedAt: null,
          isPrivate: true,
        },
        {
          id: 'deleted-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Deleted Match',
          emoji: null,
          parentId: null,
          deletedAt: new Date().toISOString(),
          isPrivate: false,
        },
        {
          id: 'denied-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Denied Match',
          emoji: null,
          parentId: null,
          deletedAt: null,
          isPrivate: false,
        },
      ],
      searchResults: [
        { pageId: 'title-page', score: 0.98, snippet: 'Title snippet' },
        { pageId: 'content-page', score: 0.96, snippet: 'Content snippet' },
        { pageId: 'value-page', score: 0.91, snippet: 'Value snippet' },
        { pageId: 'private-page', score: 0.89, snippet: 'Private snippet' },
        { pageId: 'deleted-page', score: 0.88, snippet: 'Deleted snippet' },
        { pageId: 'denied-page', score: 0.87, snippet: 'Denied snippet' },
      ],
      denyPageIds: ['denied-page'],
    });

    const result = await queryWorkspaceSearchResults(
      { workspaceId: SEED.workspace.id, query: 'match', type: 'page', limit: 10 },
      { user: { id: SEED.user.id } } as never
    );

    expect(result.results).toEqual([
      {
        page: { id: 'title-page', name: 'Title Match', emoji: '📄', parentId: null, isPrivate: false },
        ancestors: [],
        score: 0.98,
        snippet: 'Title snippet',
      },
      {
        page: { id: 'content-page', name: 'Content Match', emoji: null, parentId: SEED.pages.root.id, isPrivate: false },
        ancestors: [{ id: SEED.pages.root.id, name: SEED.pages.root.name }],
        score: 0.96,
        snippet: 'Content snippet',
      },
      {
        page: { id: 'value-page', name: 'Value Match', emoji: null, parentId: SEED.dataSource.id, isPrivate: false },
        ancestors: [],
        score: 0.91,
        snippet: 'Value snippet',
      },
      {
        page: { id: 'private-page', name: 'Private Match', emoji: null, parentId: null, isPrivate: true },
        ancestors: [],
        score: 0.89,
        snippet: 'Private snippet',
      },
    ]);
    expect(searchWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: SEED.workspace.id,
        query: 'match',
        limit: 10,
        responseTimeoutMs: 1234,
      })
    );
    expect(assertContentAccess).toHaveBeenCalledTimes(5);
  });

  test.each([
    { permission: 'read' as const, scopeType: 'workspace' as const },
    { permission: 'read' as const, scopeType: 'containers' as const, scopedContainerIds: [SEED.pages.root.id] },
    {
      permission: 'read_write' as const,
      scopeType: 'containers_with_children' as const,
      scopedContainerIds: [SEED.pages.root.id],
    },
  ])('forwards the resolved grant and succeeds for read-capable scopes (%s)', async (grant) => {
    process.env['JOB_SOCKET_PATH'] = '/workspace/apps/web/test.sock';
    const { queryWorkspaceSearchResults, searchWorkspace } = await loadModule({
      grant: { workspaceId: SEED.workspace.id, ...grant },
      rows: [
        {
          id: 'allowed-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Allowed',
          emoji: null,
          parentId: null,
          deletedAt: null,
          isPrivate: false,
        },
      ],
      searchResults: [{ pageId: 'allowed-page', score: 0.8, snippet: 'Allowed snippet' }],
    });

    const session = {
      user: { id: SEED.user.id },
      appContext: { accessGrant: { workspaceId: SEED.workspace.id, ...grant } },
    } as never;

    const result = await queryWorkspaceSearchResults(
      { workspaceId: SEED.workspace.id, query: 'allowed', type: 'page', limit: 10 },
      session
    );

    expect(result.results).toHaveLength(1);
    expect(searchWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        grant: expect.objectContaining(grant),
      })
    );
  });

  test('returns an empty result set when the workspace has no matches', async () => {
    process.env['JOB_SOCKET_PATH'] = '/workspace/apps/web/test.sock';
    const { queryWorkspaceSearchResults } = await loadModule({ searchResults: [] });

    const result = await queryWorkspaceSearchResults(
      { workspaceId: SEED.workspace.id, query: 'nothing', type: 'page', limit: 10 },
      { user: { id: SEED.user.id } } as never
    );

    expect(result).toEqual({ results: [] });
  });

  test('maps jobs failures to a 503 with the fixed client-safe message', async () => {
    process.env['JOB_SOCKET_PATH'] = '/workspace/apps/web/test.sock';

    vi.doMock('next/server', async () => {
      const actual = await vi.importActual<typeof import('next/server')>('next/server');
      return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
    });
    vi.doMock('@/lib/auth/session', () => ({
      getSessionOrApiKey: vi.fn().mockResolvedValue({ user: { id: SEED.user.id } }),
    }));

    const { GET, logger } = await loadModule({
      searchError: new Error('socket down'),
    });

    const response = await GET(new Request(`http://localhost/api/v1/search?workspaceId=${SEED.workspace.id}&query=root&type=page&limit=20`) as never, {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Search is temporarily unavailable' });
    expect(logger.error).toHaveBeenCalledWith(
      'search.query.failed',
      expect.objectContaining({ workspaceId: SEED.workspace.id })
    );
  });

  test('accepts a read-only app grant because search is a read operation', async () => {
    process.env['JOB_SOCKET_PATH'] = '/workspace/apps/web/test.sock';
    const { queryWorkspaceSearchResults, searchWorkspace } = await loadModule({
      grant: {
        workspaceId: SEED.workspace.id,
        permission: 'read',
        scopeType: 'workspace',
      },
      rows: [
        {
          id: 'readable-page',
          workspaceId: SEED.workspace.id,
          type: 'page',
          name: 'Readable',
          emoji: null,
          parentId: null,
          deletedAt: null,
          isPrivate: false,
        },
      ],
      searchResults: [{ pageId: 'readable-page', score: 0.7, snippet: 'Readable snippet' }],
    });

    const result = await queryWorkspaceSearchResults(
      { workspaceId: SEED.workspace.id, query: 'readable', type: 'page', limit: 10 },
      {
        user: { id: SEED.user.id },
        appContext: {
          accessGrant: {
            workspaceId: SEED.workspace.id,
            permission: 'read',
            scopeType: 'workspace',
          },
        },
      } as never
    );

    expect(result.results).toHaveLength(1);
    expect(searchWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        grant: expect.objectContaining({ permission: 'read', scopeType: 'workspace' }),
      })
    );
  });
});
