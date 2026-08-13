import { describe, test, expect, vi, beforeEach } from 'vitest';

const { createStorageAdapterMock } = vi.hoisted(() => ({
  createStorageAdapterMock: vi.fn().mockReturnValue({ delete: vi.fn() }),
}));

vi.mock('@thoth/storage', () => ({
  createStorageAdapter: createStorageAdapterMock,
}));

vi.mock('./environment.js', () => ({
  getEnvironment: () => ({ STORAGE_TYPE: 'local', STORAGE_LOCAL_FOLDER: '/tmp/fixture' }),
}));

describe('storage-context', () => {
  beforeEach(async () => {
    createStorageAdapterMock.mockClear();
    const { resetStorageAdapterForTests } = await import('./storage-context.js');
    resetStorageAdapterForTests();
  });

  test('builds the adapter from the jobs process environment', async () => {
    const { getStorageAdapter } = await import('./storage-context.js');

    getStorageAdapter();

    expect(createStorageAdapterMock).toHaveBeenCalledWith({ type: 'local', localFolder: '/tmp/fixture' });
  });

  test('caches the adapter instance across calls', async () => {
    const { getStorageAdapter } = await import('./storage-context.js');

    const first = getStorageAdapter();
    const second = getStorageAdapter();

    expect(first).toBe(second);
    expect(createStorageAdapterMock).toHaveBeenCalledTimes(1);
  });
});
