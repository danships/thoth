import nextConfig from 'eslint-config-next/core-web-vitals';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

const eslintConfig = [
  ...nextConfig,
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
          ignore: [
            String.raw`^\[`, // ignore Next.js dynamic route segments like [id], [...catchAll]
          ],
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // Pin the React version instead of using eslint-config-next's default
    // `settings.react.version: 'detect'`. Auto-detection calls
    // eslint-plugin-react's context.getFilename(), which was removed in
    // ESLint 9+, and crashes every rule that needs the React version.
    settings: {
      react: {
        version: '19.2.7',
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      '**/.next/**',
      '**/node_modules/**',
      'commitlint.config.js',
    ],
  },
  {
    // Restrict linting to TypeScript files only, replacing the previous
    // `eslint --ext .ts,.tsx` CLI flag which is unsupported on flat config.
    ignores: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  },
];

export default eslintConfig;
