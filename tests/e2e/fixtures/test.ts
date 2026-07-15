import { test as base } from '@playwright/test';
import { SEED } from '../constants';

export { expect } from '@playwright/test';

export const test = base.extend<{
  seedData: typeof SEED;
}>({
  seedData: async ({}, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(SEED);
  },
});
