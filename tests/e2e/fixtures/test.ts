import { test as base, expect } from '@playwright/test';
import { SEED } from '../constants';

export { expect };

export const test = base.extend<{
  seedData: typeof SEED;
}>({
  seedData: async ({}, use) => {
    await use(SEED);
  },
});
