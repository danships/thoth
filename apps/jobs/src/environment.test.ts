import { describe, test, expect, afterEach } from 'vitest';
import { getEnvironment, resetEnvironmentCacheForTests } from './environment';

const REQUIRED_BASE_ENV = {
  NODE_ENV: 'test',
  DB: 'sqlite://:memory:',
};

const NUMERIC_KEYS = [
  'JOB_POLL_INTERVAL_MS',
  'JOB_SHUTDOWN_TIMEOUT_MS',
  'JOB_CONCURRENCY',
  'JOB_RETENTION_MS',
  'JOB_RETENTION_MAX',
  'JOB_SCHEDULER_TICK_MS',
] as const;

function withEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...REQUIRED_BASE_ENV, ...overrides };
}

describe('jobs environment boundary validation', () => {
  afterEach(() => {
    resetEnvironmentCacheForTests();
  });

  test('accepts defaults with no timing/concurrency overrides', () => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({});
    try {
      expect(() => getEnvironment()).not.toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  test.each(NUMERIC_KEYS)('rejects zero for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({ [key]: '0' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  test.each(NUMERIC_KEYS)('rejects negative values for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({ [key]: '-1' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  test.each(NUMERIC_KEYS)('rejects fractional values for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({ [key]: '1.5' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  test.each(NUMERIC_KEYS)('rejects Infinity for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({ [key]: 'Infinity' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  test.each(NUMERIC_KEYS)('rejects NaN for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({ [key]: 'not-a-number' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  test.each(NUMERIC_KEYS)('accepts a valid finite positive integer for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnv = process.env;
    process.env = withEnv({ [key]: '42' });
    try {
      const environment = getEnvironment();
      expect(environment[key]).toBe(42);
    } finally {
      process.env = originalEnv;
    }
  });
});
