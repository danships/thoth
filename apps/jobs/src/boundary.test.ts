import { describe, test, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import nodePath from 'node:path';

/**
 * Boundary assertion (THOTH-059, updated THOTH-061): `@thoth/jobs` must never import Next.js or
 * `@thoth/web`, and its package manifest must never declare a dependency on either (nor a
 * TCP/HTTP server framework) — the process communicates exclusively over the Unix-socket IPC
 * protocol and never opens an HTTP port.
 *
 * THOTH-061 ("Move webhook delivery to the job service") intentionally *lifts* the prior
 * THOTH-059 restriction on `@thoth/database`: webhook dispatch/delivery now runs entirely inside
 * this process, which must reload current page/data-source/App/webhook state itself rather than
 * trust a caller-supplied snapshot. `@thoth/database` is a shared, environment-neutral package
 * (no Next.js/web coupling of its own) — depending on it does not reintroduce a web dependency.
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
  test('package.json declares no next/web dependency', async () => {
    const packageJson = JSON.parse(
      await readFile(nodePath.join(__dirname, '..', 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ];
    expect(dependencyNames).not.toContain('next');
    expect(dependencyNames).not.toContain('@thoth/web');
    expect(dependencyNames).not.toContain('express');
    expect(dependencyNames).not.toContain('fastify');
  });

  test('no source file imports next/web modules', async () => {
    const files = await listSourceFiles(nodePath.join(__dirname));
    const offenders: string[] = [];
    // Matches: `import ... from 'next'`, `import 'next/foo'` (side-effect), `require('next')`,
    // and `import('next')` (dynamic) — for `next` and `@thoth/web`, with or without a trailing
    // subpath (e.g. `next/server`).
    const prohibitedImportPattern = /(?:from\s+|require\(\s*|import\(\s*|^\s*import\s+)['"](next|@thoth\/web)(?:\/[^'"]*)?['"]/m;

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      if (prohibitedImportPattern.test(content)) {
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
