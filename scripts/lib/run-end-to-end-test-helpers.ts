import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

/** Prefix used for every temporary directory this launcher creates and later removes. */
export const TEMP_DIR_PREFIX = 'thoth-e2e-';

/**
 * Creates a fresh, uniquely-named temporary directory for one hermetic E2E run.
 * Uses `fs.mkdtempSync` (not a hand-built path) so the OS guarantees uniqueness and the
 * directory is created with restrictive default permissions.
 */
export function createTemporaryStateDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), TEMP_DIR_PREFIX));
}

/**
 * Removes a temporary state directory previously returned by `createTemporaryStateDirectory`.
 *
 * Refuses to touch anything else: the resolved (symlink-free) path must live directly under the
 * OS temp directory and have the expected prefix. This guards against ever recursively deleting
 * a broad path such as `/`, a home directory, or the repository root — even if `temporaryDirectory` were
 * ever corrupted or replaced by caller error.
 */
export function removeTemporaryStateDirectory(temporaryDirectory: string): void {
  const resolvedTemporaryRoot = realpathSync(tmpdir());
  const resolvedTarget = path.resolve(temporaryDirectory);
  const expectedParent = resolvedTemporaryRoot + path.sep;

  if (!resolvedTarget.startsWith(expectedParent) || !path.basename(resolvedTarget).startsWith(TEMP_DIR_PREFIX)) {
    throw new Error(
      `Refusing to remove "${temporaryDirectory}": it does not look like a directory created by createTemporaryStateDirectory().`
    );
  }

  rmSync(resolvedTarget, { recursive: true, force: true });
}

const SQLITE_URL_PREFIX = 'sqlite://';

/**
 * Builds the environment overrides for one hermetic (non-standalone/local) E2E run: a private
 * SQLite database file and upload folder inside `temporaryDirectory`, so repeated runs never share state
 * and a failed/interrupted run cannot leak mutations into the next one.
 *
 * Rejects a non-SQLite `DB` override rather than silently ignoring it, deleting it, or rewriting
 * it: ephemeral local mode only knows how to isolate SQLite files safely.
 */
export function buildEphemeralEnvironment(
  baseEnvironment: Record<string, string | undefined>,
  temporaryDirectory: string
): Record<string, string | undefined> {
  const existingDatabase = baseEnvironment['DB'];
  if (existingDatabase !== undefined && !existingDatabase.startsWith(SQLITE_URL_PREFIX)) {
    throw new Error(
      `DB="${existingDatabase}" is not a sqlite:// connection string. Local ephemeral E2E runs only ` +
        'support SQLite; refusing to delete or rewrite an arbitrary database. Unset DB, or use ' +
        'a sqlite:// URL, to run the hermetic test launcher.'
    );
  }

  return {
    ...baseEnvironment,
    DB: `sqlite://${path.join(temporaryDirectory, 'thoth-e2e.db')}`,
    STORAGE_LOCAL_FOLDER: path.join(temporaryDirectory, 'uploads'),
  };
}

/**
 * Forwards every CLI argument the launcher received to the underlying `pnpm exec playwright
 * test` invocation — e.g. `pnpm test:e2e -- tests/e2e/pages/page-detail.spec.ts:96`.
 *
 * Package managers (pnpm/npm/yarn) forward a literal, leading `--` separator used to mark "these
 * are arguments for the script, not for the package manager itself" — it is not meaningful to
 * Playwright's CLI and would otherwise be misread as a positional filter, so it is stripped here
 * rather than passed through.
 */
export function buildPlaywrightArguments(forwardedArguments: string[]): string[] {
  const [firstArgument, ...rest] = forwardedArguments;
  const cleanedArguments = firstArgument === '--' ? rest : forwardedArguments;
  return ['exec', 'playwright', 'test', ...cleanedArguments];
}
