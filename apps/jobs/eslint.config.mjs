import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const eslintConfig = [
  ...tseslint.configs.recommended,
  eslintPluginUnicorn.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      'unicorn/no-useless-undefined': 'off',
      'unicorn/no-null': 'off',
      quotes: 'off',
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      // apps/jobs is a standalone process entry point (not a library import), so calling
      // process.exit() for orderly shutdown/fatal-error handling is intentional.
      'unicorn/no-process-exit': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', '**/node_modules/**', '**/dist/**'],
  },
  {
    ignores: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  },
];

export default eslintConfig;
