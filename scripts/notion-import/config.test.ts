import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from './config';

const REQUIRED_ENV = {
  NOTION_TOKEN: 'secret_abc',
  THOTH_API_URL: 'https://thoth.example.com/api/v1',
  THOTH_API_KEY: 'thk_xyz',
  THOTH_WORKSPACE_ID: 'ws_123',
  STATE_FILE: './state.json',
};

describe('loadConfig', () => {
  it('loads a valid, fully-specified configuration', () => {
    const config = loadConfig({ ...REQUIRED_ENV });
    expect(config).toMatchObject({
      notionToken: 'secret_abc',
      thothApiUrl: 'https://thoth.example.com/api/v1',
      thothApiKey: 'thk_xyz',
      thothWorkspaceId: 'ws_123',
      stateFilePath: './state.json',
      dryRun: false,
      notionRootIds: null,
      importMode: 'auto',
    });
  });

  for (const missing of ['NOTION_TOKEN', 'THOTH_API_URL', 'THOTH_API_KEY', 'THOTH_WORKSPACE_ID', 'STATE_FILE']) {
    it(`throws ConfigError when ${missing} is missing`, () => {
      const environment = { ...REQUIRED_ENV };
      delete (environment as Record<string, string | undefined>)[missing];
      expect(() => loadConfig(environment)).toThrow(ConfigError);
    });
  }

  it('rejects a non-http(s) THOTH_API_URL', () => {
    expect(() => loadConfig({ ...REQUIRED_ENV, THOTH_API_URL: 'ftp://thoth.example.com' })).toThrow(ConfigError);
  });

  it('parses DRY_RUN as a boolean', () => {
    expect(loadConfig({ ...REQUIRED_ENV, DRY_RUN: 'true' }).dryRun).toBe(true);
    expect(loadConfig({ ...REQUIRED_ENV, DRY_RUN: '1' }).dryRun).toBe(true);
    expect(loadConfig({ ...REQUIRED_ENV, DRY_RUN: 'false' }).dryRun).toBe(false);
    expect(loadConfig({ ...REQUIRED_ENV }).dryRun).toBe(false);
  });

  it('parses NOTION_ROOT_IDS as a comma-separated list', () => {
    const config = loadConfig({ ...REQUIRED_ENV, NOTION_ROOT_IDS: 'id-1, id-2 ,id-3' });
    expect(config.notionRootIds).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('defaults IMPORT_MODE to auto and accepts initial/sync', () => {
    expect(loadConfig({ ...REQUIRED_ENV }).importMode).toBe('auto');
    expect(loadConfig({ ...REQUIRED_ENV, IMPORT_MODE: 'initial' }).importMode).toBe('initial');
    expect(loadConfig({ ...REQUIRED_ENV, IMPORT_MODE: 'sync' }).importMode).toBe('sync');
  });

  it('rejects an invalid IMPORT_MODE', () => {
    expect(() => loadConfig({ ...REQUIRED_ENV, IMPORT_MODE: 'bogus' })).toThrow(ConfigError);
  });

  it('defaults THOTH_TARGET_PARENT_ID to null when unset', () => {
    expect(loadConfig({ ...REQUIRED_ENV }).thothTargetParentId).toBeNull();
  });

  it('strips a trailing slash from THOTH_API_URL', () => {
    expect(loadConfig({ ...REQUIRED_ENV, THOTH_API_URL: 'https://thoth.example.com/api/v1/' }).thothApiUrl).toBe(
      'https://thoth.example.com/api/v1'
    );
  });
});
