import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureVapidKeys, resolveVapidDirectory, resolveVapidSubject } from '../../../../scripts/ensure-vapid-keys.mjs';

describe('resolveVapidDirectory', () => {
  test('defaults to <repo>/data when unset', () => {
    expect(resolveVapidDirectory('/repo', undefined)).toBe(path.resolve('/repo', 'data'));
    expect(resolveVapidDirectory('/repo', '  ')).toBe(path.resolve('/repo', 'data'));
  });
  test('absolute override wins', () => {
    expect(resolveVapidDirectory('/repo', '/etc/thoth')).toBe('/etc/thoth');
  });
  test('relative override is repo-relative', () => {
    expect(resolveVapidDirectory('/repo', 'var/keys')).toBe(path.resolve('/repo', 'var/keys'));
  });
});

describe('resolveVapidSubject', () => {
  test('explicit env wins', () => {
    expect(resolveVapidSubject({ WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@thoth.example' })).toBe(
      'mailto:ops@thoth.example'
    );
  });
  test('derives from APP_URL host', () => {
    expect(resolveVapidSubject({ APP_URL: 'https://thoth.example.com:3000' })).toBe(
      'mailto:admin@thoth.example.com'
    );
  });
  test('falls back to localhost placeholder', () => {
    expect(resolveVapidSubject({})).toBe('mailto:notifications@localhost');
  });
});

describe('ensureVapidKeys', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'thoth-vapid-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('WEB_PUSH_ENABLED=false is a no-op regardless of file state', async () => {
    const result = await ensureVapidKeys({ enabled: false, dir, environment: {} });
    expect(result).toEqual({ skipped: true });
    expect(existsSync(path.join(dir, 'vapid.json'))).toBe(false);
  });

  test('generates + persists + reuses across calls', async () => {
    const first = await ensureVapidKeys({ enabled: true, dir, environment: {} });
    if ('skipped' in first) throw new Error('did not generate');
    expect(first.source).toBe('generated');
    expect(first.publicKey.length).toBeGreaterThan(10);
    expect(first.privateKey.length).toBeGreaterThan(10);
    expect(existsSync(path.join(dir, 'vapid.json'))).toBe(true);

    const persisted = JSON.parse(await readFile(path.join(dir, 'vapid.json'), 'utf8'));
    expect(persisted.publicKey).toBe(first.publicKey);
    expect(persisted.privateKey).toBe(first.privateKey);
    expect(persisted.subject).toBe(first.subject);

    const second = await ensureVapidKeys({ enabled: true, dir, environment: {} });
    if ('skipped' in second) throw new Error('did not reuse');
    expect(second.source).toBe('file');
    expect(second.publicKey).toBe(first.publicKey);
    expect(second.privateKey).toBe(first.privateKey);
  });

  test('explicit env keys win over the persisted file', async () => {
    const result = await ensureVapidKeys({
      enabled: true,
      dir,
      environment: {
        WEB_PUSH_VAPID_PUBLIC_KEY: 'PUB',
        WEB_PUSH_VAPID_PRIVATE_KEY: 'PRIV',
        WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
      },
    });
    if ('skipped' in result) throw new Error('should not skip');
    expect(result.source).toBe('env');
    expect(result.publicKey).toBe('PUB');
    expect(result.privateKey).toBe('PRIV');
    // Env wins so no file was written.
    expect(existsSync(path.join(dir, 'vapid.json'))).toBe(false);
  });

  test('half-configured env keys are a fatal error', async () => {
    await expect(
      ensureVapidKeys({ enabled: true, dir, environment: { WEB_PUSH_VAPID_PUBLIC_KEY: 'PUB' } })
    ).rejects.toThrow(/must be set together/);
    await expect(
      ensureVapidKeys({ enabled: true, dir, environment: { WEB_PUSH_VAPID_PRIVATE_KEY: 'PRIV' } })
    ).rejects.toThrow(/must be set together/);
  });

  test('malformed file falls through to regeneration', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'vapid.json'), 'this is not json');
    const result = await ensureVapidKeys({ enabled: true, dir, environment: {} });
    if ('skipped' in result) throw new Error('should not skip');
    expect(result.source).toBe('generated');
    // The malformed file should now be replaced with a valid one.
    const parsed = JSON.parse(readFileSync(path.join(dir, 'vapid.json'), 'utf8'));
    expect(parsed.publicKey).toBe(result.publicKey);
  });
});
