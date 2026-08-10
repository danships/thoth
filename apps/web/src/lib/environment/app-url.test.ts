import { afterEach, describe, expect, test } from 'vitest';
import { resolveAppUrl } from './app-url';
import type { getEnvironment } from '../environment';

type Environment = Awaited<ReturnType<typeof getEnvironment>>;

function makeEnvironment(appUrl: string | undefined): Environment {
  return { APP_URL: appUrl } as unknown as Environment;
}

describe('resolveAppUrl', () => {
  const originalPort = process.env['PORT'];

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env['PORT'];
    } else {
      process.env['PORT'] = originalPort;
    }
  });

  test('returns the explicit APP_URL when set', () => {
    expect(resolveAppUrl(makeEnvironment('https://thoth.example.com'))).toBe('https://thoth.example.com');
  });

  test('falls back to http://localhost:3000 when APP_URL and PORT are both unset', () => {
    delete process.env['PORT'];
    expect(resolveAppUrl(makeEnvironment(undefined))).toBe('http://localhost:3000');
  });

  test('falls back to http://localhost:${PORT} when APP_URL is unset but PORT is set', () => {
    process.env['PORT'] = '4000';
    expect(resolveAppUrl(makeEnvironment(undefined))).toBe('http://localhost:4000');
  });
});
