import { describe, test, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import nodePath from 'node:path';

/**
 * Boundary assertion (THOTH-059): `@thoth/jobs` must never import any Next.js/web/database
 * module, and its package manifest must never declare a dependency on `next`, `@thoth/database`,
 * or a TCP/HTTP server framework. Job state is in-memory only; the process communicates
 * exclusively over the Unix-socket IPC protocol.
 */
async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('jobs boundary', () => {
  test('package.json declares no next/web/database dependency', async () => {
    const packageJson = JSON.parse(
      await readFile(nodePath.join(__dirname, '..', 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> };

    const dependencyNames = Object.keys(packageJson.dependencies ?? {});
    expect(dependencyNames).not.toContain('next');
    expect(dependencyNames).not.toContain('@thoth/web');
    expect(dependencyNames).not.toContain('@thoth/database');
    expect(dependencyNames).not.toContain('express');
    expect(dependencyNames).not.toContain('fastify');
  });

  test('no source file imports next/web/database modules', async () => {
    const files = await listSourceFiles(nodePath.join(__dirname));
    const offenders: string[] = [];

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      if (/from ['"](next|@thoth\/web|@thoth\/database)/.test(content)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('server only ever binds a Unix domain socket, never a TCP/HTTP port', async () => {
    const serverSource = await readFile(nodePath.join(__dirname, 'socket', 'server.ts'), 'utf8');
    // `server.listen(this.options.socketPath, ...)` — a single string argument is a UDS bind;
    // guard against an accidental `{ port: ... }` / numeric-port listen creeping in later.
    expect(serverSource).not.toMatch(/\.listen\(\s*\d/);
    expect(serverSource).not.toMatch(/port\s*:/i);
  });
});
