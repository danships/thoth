import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEphemeralEnvironment,
  buildPlaywrightArguments,
  createTemporaryStateDirectory,
  removeTemporaryStateDirectory,
} from './run-end-to-end-test-helpers';

describe('createTemporaryStateDirectory / removeTemporaryStateDirectory', () => {
  const createdDirectories: string[] = [];

  afterEach(() => {
    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('creates a unique directory under the OS temp directory with the expected prefix', () => {
    const directory = createTemporaryStateDirectory();
    createdDirectories.push(directory);

    expect(existsSync(directory)).toBe(true);
    expect(path.dirname(directory)).toBe(tmpdir());
    expect(path.basename(directory)).toMatch(/^thoth-e2e-/);
  });

  it('creates a different directory on each call', () => {
    const first = createTemporaryStateDirectory();
    const second = createTemporaryStateDirectory();
    createdDirectories.push(first, second);

    expect(first).not.toBe(second);
  });

  it('removes exactly the directory it was given', () => {
    const directory = createTemporaryStateDirectory();
    removeTemporaryStateDirectory(directory);

    expect(existsSync(directory)).toBe(false);
  });

  it('refuses to remove a path outside the temp directory root', () => {
    const outsideDirectory = path.join(process.cwd(), 'thoth-e2e-fake-outside-directory');
    expect(() => removeTemporaryStateDirectory(outsideDirectory)).toThrow(/Refusing to remove/);
  });

  it('refuses to remove a path under the temp directory that lacks the expected prefix', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'not-thoth-'));
    createdDirectories.push(directory);

    expect(() => removeTemporaryStateDirectory(directory)).toThrow(/Refusing to remove/);
  });

  it('refuses to remove the temp directory root itself', () => {
    expect(() => removeTemporaryStateDirectory(tmpdir())).toThrow(/Refusing to remove/);
  });
});

describe('buildEphemeralEnvironment', () => {
  it('points DB and STORAGE_LOCAL_FOLDER inside the given temp directory when DB is unset', () => {
    const environment = buildEphemeralEnvironment({ PATH: '/usr/bin' }, '/tmp/thoth-e2e-abc123');

    expect(environment['DB']).toBe('sqlite:///tmp/thoth-e2e-abc123/thoth-e2e.db');
    expect(environment['STORAGE_LOCAL_FOLDER']).toBe('/tmp/thoth-e2e-abc123/uploads');
    expect(environment['PATH']).toBe('/usr/bin');
  });

  it('overrides an existing sqlite:// DB with the isolated temp-directory path', () => {
    const environment = buildEphemeralEnvironment({ DB: 'sqlite:///tmp/thoth-e2e.db' }, '/tmp/thoth-e2e-abc123');

    expect(environment['DB']).toBe('sqlite:///tmp/thoth-e2e-abc123/thoth-e2e.db');
  });

  it('throws a clear error for a non-sqlite DB override rather than deleting/rewriting it', () => {
    expect(() => buildEphemeralEnvironment({ DB: 'mysql://user:pass@host/db' }, '/tmp/thoth-e2e-abc123')).toThrow(
      /only support SQLite/
    );
  });
});

describe('buildPlaywrightArguments', () => {
  it('forwards all provided arguments unchanged after the playwright test invocation', () => {
    expect(buildPlaywrightArguments([])).toEqual(['exec', 'playwright', 'test']);
    expect(buildPlaywrightArguments(['--shard=2/4'])).toEqual(['exec', 'playwright', 'test', '--shard=2/4']);
    expect(buildPlaywrightArguments(['tests/e2e/pages/page-detail.spec.ts:96'])).toEqual([
      'exec',
      'playwright',
      'test',
      'tests/e2e/pages/page-detail.spec.ts:96',
    ]);
  });

  it('strips a package-manager-forwarded leading "--" separator', () => {
    expect(buildPlaywrightArguments(['--', 'tests/e2e/pages/page-detail.spec.ts:96'])).toEqual([
      'exec',
      'playwright',
      'test',
      'tests/e2e/pages/page-detail.spec.ts:96',
    ]);
  });
});
