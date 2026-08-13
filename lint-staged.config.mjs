/* eslint-disable import/no-anonymous-default-export */
export default {
  '*': 'prettier --write --ignore-unknown',
  // Every eslint.config.mjs in this repo (root, apps/web, apps/jobs, packages/*) restricts
  // linting to `**/*.ts`/`**/*.tsx` only. Passing a `.js`/`.cjs`/`.mjs`/`.jsx` file to `eslint`
  // explicitly (as lint-staged does) triggers a "file ignored" warning that fails
  // `--max-warnings 0`, so only run eslint against the extensions it actually lints.
  '*.(ts|tsx)': (files) => [
    `eslint --max-warnings 0 ${files.map((file) => `"${file}"`).join(' ')}`,
    'tsc -p tsconfig.json --noEmit',
    'pnpm --filter @thoth/web lint:tsc',
  ],
};
