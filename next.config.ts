import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Pin the file-tracing root to this project directory. Without this, Next/Turbopack's
  // output-file tracing can walk up past this directory (e.g. detecting an ancestor as the
  // workspace root) and mirror the entire project — including `src`, `tests`, docs, and
  // config files — into a nested folder inside `.next/standalone`, instead of producing a
  // flat, minimal standalone output at its root (see THOTH-070).
  outputFileTracingRoot: path.join(import.meta.dirname),
  serverExternalPackages: ['better-sqlite3', 'mysql2'],
};

export default nextConfig;
