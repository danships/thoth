import { describe, test, expect, beforeEach } from 'vitest';
import { setQueueService, getQueueService, resetQueueServiceForTests } from './queue-context.js';
import { QueueService } from './queue-service.js';

describe('queue-context', () => {
  beforeEach(() => {
    resetQueueServiceForTests();
  });

  test('throws when accessed before setQueueService is called', () => {
    expect(() => getQueueService()).toThrow(/before it was set/);
  });

  test('returns the instance passed to setQueueService', () => {
    const service = new QueueService();
    setQueueService(service);
    expect(getQueueService()).toBe(service);
  });
});
