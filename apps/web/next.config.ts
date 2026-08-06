import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'mysql2'],
  // Point Next.js at the monorepo root so the standalone output trace picks up the shared
  // pnpm workspace `node_modules` (symlinked via the pnpm store) instead of only `apps/web`.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
