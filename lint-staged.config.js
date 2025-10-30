/* eslint-disable import/no-anonymous-default-export */
export default {
  '*': 'prettier --write --ignore-unknown',
  '*.(js|cjs|mjs|jsx|ts|tsx|svelte)': 'eslint --max-warnings 0',
  '*.(ts|tsx)': () => 'tsc -p tsconfig.json --noEmit',
};
