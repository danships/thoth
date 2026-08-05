import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';

import type { DataSourceContainer, PageContainer } from '@/types/database';

function makeDataSource(): DataSourceContainer {
  return {
    id: 'ds-1',
    name: 'Test Data Source',
    type: 'data-source',
    parentId: null,
    workspaceId: 'workspace-1',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    deletedAt: null,
    deletedRootId: null,
    columns: [{ id: 'col-file', name: 'Attachment', type: 'file' }],
  };
}

function makePage(values: PageContainer['values']): PageContainer {
  return {
    id: 'page-1',
    name: 'Test page',
    type: 'page',
    parentId: 'ds-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    emoji: null,
    values,
    lastUpdated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedRootId: null,
  };
}

describe('buildPayload — file column values (THOTH-054)', () => {
  let temporaryDirectory = '';
  let originalEnvironment: Record<string, string | undefined> = {};
  let uploadedFileRepository: Awaited<ReturnType<(typeof import('@/lib/database'))['getUploadedFileRepository']>>;
  let buildPayload: (typeof import('./build-payload'))['buildPayload'];

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), 'thoth-build-payload-test-'));
    const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    originalEnvironment = {
      NODE_ENV: mutableEnvironment['NODE_ENV'],
      DB: mutableEnvironment['DB'],
      BETTER_AUTH_SECRET: mutableEnvironment['BETTER_AUTH_SECRET'],
      LOG_LEVEL: mutableEnvironment['LOG_LEVEL'],
      SUPERSAVE_SKIP_SYNC: mutableEnvironment['SUPERSAVE_SKIP_SYNC'],
    };
    mutableEnvironment['NODE_ENV'] = 'test';
    mutableEnvironment['DB'] = `sqlite://${databaseFile}`;
    mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
    mutableEnvironment['LOG_LEVEL'] = 'error';
    mutableEnvironment['SUPERSAVE_SKIP_SYNC'] = 'false';

    const databaseModule = await import('@/lib/database');
    const buildPayloadModule = await import('./build-payload');

    uploadedFileRepository = await databaseModule.getUploadedFileRepository();
    buildPayload = buildPayloadModule.buildPayload;
  });

  afterAll(async () => {
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete mutableEnvironment[key];
      } else {
        mutableEnvironment[key] = value;
      }
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test('resolves a file value to {id, filename, url}', async () => {
    await uploadedFileRepository.create({
      id: 'file-1',
      filename: 'photo.png',
      mimeType: 'image/png',
      size: 10,
      extension: 'png',
      storageKey: 'workspace-1/file-1',
      storageType: 'local',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      // `create`'s type omits `id` (normally auto-generated), but a fixed, test-chosen id is
      // required here to reference it from a `PageValue` below — matches the same cast used in
      // `scripts/end-to-end-seed.ts`'s `upsertUploadedFileWithUsage` helper.
    } as unknown as Parameters<typeof uploadedFileRepository.create>[0]);

    const dataSource = makeDataSource();
    const page = makePage({ 'col-file': { type: 'file', value: 'file-1' } });

    const payload = await buildPayload('page.updated', 'delivery-1', 'workspace-1', 'app-1', page, dataSource);

    expect(payload.values?.['Attachment']).toEqual({
      id: 'file-1',
      filename: 'photo.png',
      url: '/api/v1/files/file-1/content',
    });
  });

  test('returns null for an empty file cell', async () => {
    const dataSource = makeDataSource();
    const page = makePage({ 'col-file': { type: 'file', value: null } });

    const payload = await buildPayload('page.updated', 'delivery-2', 'workspace-1', 'app-1', page, dataSource);

    expect(payload.values?.['Attachment']).toBeNull();
  });

  test('falls back to filename: null for a dangling file id', async () => {
    const dataSource = makeDataSource();
    const page = makePage({ 'col-file': { type: 'file', value: 'does-not-exist' } });

    const payload = await buildPayload('page.updated', 'delivery-3', 'workspace-1', 'app-1', page, dataSource);

    expect(payload.values?.['Attachment']).toEqual({
      id: 'does-not-exist',
      filename: null,
      url: '/api/v1/files/does-not-exist/content',
    });
  });
});
