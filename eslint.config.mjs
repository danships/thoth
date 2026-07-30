import nextConfig from 'eslint-config-next/core-web-vitals';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

const eslintConfig = [
  ...nextConfig,
  eslintPluginUnicorn.configs.recommended,
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
