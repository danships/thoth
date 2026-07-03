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
];

export default eslintConfig;
