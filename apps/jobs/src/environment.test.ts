import { afterEach, describe, expect, test } from 'vitest';
import { getEnvironment, resetEnvironmentCacheForTests } from './environment.js';

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
  'SEARCH_INDEX_VERSION',
  'SEARCH_QUERY_TIMEOUT_MS',
  'SEARCH_RECONCILE_INTERVAL_MS',
] as const;

function withEnvironment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...REQUIRED_BASE_ENV, ...overrides };
}

describe('jobs environment boundary validation', () => {
  afterEach(() => {
    resetEnvironmentCacheForTests();
  });

  test('accepts defaults with no timing/concurrency overrides', () => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({});
    try {
      expect(() => getEnvironment()).not.toThrow();
    } finally {
      process.env = originalEnvironment;
    }
  });

  test('applies search defaults', () => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({});
    try {
      const environment = getEnvironment();
      expect(environment.SEARCH_MODEL_ID).toBe('Xenova/all-MiniLM-L6-v2');
      expect(environment.SEARCH_MODEL_CACHE_DIR).toBe('data/models/search');
      expect(environment.SEARCH_INDEX_VERSION).toBe(1);
      expect(environment.SEARCH_QUERY_TIMEOUT_MS).toBe(120000);
      expect(environment.SEARCH_RECONCILE_INTERVAL_MS).toBe(3600000);
    } finally {
      process.env = originalEnvironment;
    }
  });

  test.each(NUMERIC_KEYS)('rejects zero for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({ [key]: '0' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnvironment;
    }
  });

  test.each(NUMERIC_KEYS)('rejects negative values for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({ [key]: '-1' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnvironment;
    }
  });

  test.each(NUMERIC_KEYS)('rejects fractional values for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({ [key]: '1.5' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnvironment;
    }
  });

  test.each(NUMERIC_KEYS)('rejects Infinity for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({ [key]: 'Infinity' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnvironment;
    }
  });

  test.each(NUMERIC_KEYS)('rejects NaN for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({ [key]: 'not-a-number' });
    try {
      expect(() => getEnvironment()).toThrow();
    } finally {
      process.env = originalEnvironment;
    }
  });

  test.each(NUMERIC_KEYS)('accepts a valid finite positive integer for %s', (key) => {
    resetEnvironmentCacheForTests();
    const originalEnvironment = process.env;
    process.env = withEnvironment({ [key]: '42' });
    try {
      const environment = getEnvironment();
      expect(environment[key]).toBe(42);
    } finally {
      process.env = originalEnvironment;
    }
  });
});
