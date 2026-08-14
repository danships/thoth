import { existsSync, mkdirSync, chmodSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Frictionless VAPID key provisioning (THOTH-071).
 *
 * Resolution precedence (each of publicKey / privateKey, stop at first hit):
 *   1. Explicit env var (WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY) — operator
 *      wins. If ONE is set, the OTHER MUST be too — half-configured is a fatal error.
 *   2. Persisted file `<dir>/vapid.json` (previously generated), if it parses.
 *   3. Generate a fresh pair via `web-push`'s `generateVAPIDKeys()`, then persist it so step 2
 *      wins on the next boot.
 *
 * Persist protocol: write to `<dir>/vapid.json.tmp-<pid>` with mode 0o600, then rename to
 * `<dir>/vapid.json`. Never leaves a truncated file. Ensures `<dir>` exists first (0o700).
 *
 * When `enabled === false`, the whole routine is a no-op — no generation, no failure.
 */

export const VAPID_FILE_NAME = 'vapid.json';
// Public-only companion file (THOTH-071 review fix): `apps/web` reads *this* file instead of
// `vapid.json` so the private key is never parsed into the web process's memory at all — the
// web process only ever needs the public key to hand to browsers via
// `GET /notifications/push-config`. Regular file permissions (no 0600) since it holds no secret.
export const VAPID_PUBLIC_FILE_NAME = 'vapid-public.json';

/**
 * @typedef {Object} EnsureVapidKeysInput
 * @property {boolean} enabled
 * @property {string} dir  Absolute directory the vapid.json file lives in.
 * @property {NodeJS.ProcessEnv} environment
 */

/**
 * @typedef {Object} EnsureVapidKeysResult
 * @property {string} publicKey
 * @property {string} privateKey
 * @property {string} subject
 * @property {'env' | 'file' | 'generated'} source
 */

/**
 * @typedef {Object} EnsureVapidKeysSkipped
 * @property {true} skipped
 */

/**
 * Resolve the default subject (`mailto:...`) from an explicit env var if set, else from the
 * host part of APP_URL, else a placeholder.
 * @param {NodeJS.ProcessEnv} environment
 * @returns {string}
 */
export function resolveVapidSubject(environment) {
  const explicit = environment.WEB_PUSH_VAPID_SUBJECT;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const appUrl = environment.APP_URL;
  if (appUrl && appUrl.trim().length > 0) {
    try {
      const host = new URL(appUrl).host;
      return `mailto:admin@${host.split(':')[0]}`;
    } catch {
      // fall through
    }
  }
  return 'mailto:notifications@localhost';
}

/**
 * Persist (or refresh) the public-only companion file so `apps/web` never has to parse
 * `vapid.json`'s `privateKey` field. Same tmp-file + rename protocol as the full record, minus
 * the restrictive mode (this file holds no secret).
 * @param {string} dir
 * @param {{ publicKey: string, subject: string }} publicRecord
 */
function persistPublicVapidFile(dir, publicRecord) {
  const publicFilePath = path.join(dir, VAPID_PUBLIC_FILE_NAME);
  const tmpPublicPath = path.join(dir, `${VAPID_PUBLIC_FILE_NAME}.tmp-${process.pid}`);
  try {
    writeFileSync(tmpPublicPath, JSON.stringify(publicRecord));
    renameSync(tmpPublicPath, publicFilePath);
  } catch (error) {
    throw new Error(
      `Failed to persist public VAPID key file "${publicFilePath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * @param {EnsureVapidKeysInput} input
 * @returns {Promise<EnsureVapidKeysResult | EnsureVapidKeysSkipped>}
 */
export async function ensureVapidKeys(input) {
  if (!input.enabled) {
    return { skipped: true };
  }
  const environment = input.environment;
  const publicFromEnv = environment.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateFromEnv = environment.WEB_PUSH_VAPID_PRIVATE_KEY;
  const dir = input.dir;

  if ((publicFromEnv && !privateFromEnv) || (!publicFromEnv && privateFromEnv)) {
    throw new Error('WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY must be set together (or both unset).');
  }

  if (publicFromEnv && privateFromEnv) {
    return {
      publicKey: publicFromEnv,
      privateKey: privateFromEnv,
      subject: resolveVapidSubject(environment),
      source: 'env',
    };
  }

  const filePath = path.join(dir, VAPID_FILE_NAME);
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (
        parsed &&
        typeof parsed.publicKey === 'string' &&
        typeof parsed.privateKey === 'string' &&
        typeof parsed.subject === 'string'
      ) {
        // Backfill the public-only companion file for files persisted before this file existed.
        persistPublicVapidFile(dir, { publicKey: parsed.publicKey, subject: parsed.subject });
        return {
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
          subject: parsed.subject,
          source: 'file',
        };
      }
    } catch {
      // Malformed file — fall through to regeneration.
    }
  }

  // Generate + persist. `web-push` is only installed in `apps/jobs`; dynamic import so this
  // script works from repo root without `apps/jobs`'s own node_modules being on the resolution
  // path (pnpm hoists `web-push` up to the root store, but dynamic import keeps us safe).
  /** @type {any} */
  let webpush;
  try {
    webpush = await import('web-push');
  } catch (error) {
    throw new Error(
      `Cannot load "web-push" to generate VAPID keys: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const generator =
    typeof webpush.generateVAPIDKeys === 'function'
      ? webpush.generateVAPIDKeys
      : webpush.default && typeof webpush.default.generateVAPIDKeys === 'function'
        ? webpush.default.generateVAPIDKeys
        : undefined;
  if (!generator) {
    throw new Error('web-push package does not expose generateVAPIDKeys');
  }
  const generated = generator();
  const subject = resolveVapidSubject(environment);
  const record = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject,
    createdAt: new Date().toISOString(),
  };

  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new Error(
      `Failed to create VAPID directory "${dir}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const tmpPath = path.join(dir, `${VAPID_FILE_NAME}.tmp-${process.pid}`);
  try {
    writeFileSync(tmpPath, JSON.stringify(record), { mode: 0o600 });
    try {
      chmodSync(tmpPath, 0o600);
    } catch {
      // best-effort; some filesystems (e.g. FAT) don't support mode bits.
    }
    renameSync(tmpPath, filePath);
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // best-effort
    }
  } catch (error) {
    throw new Error(
      `Failed to persist VAPID key file "${filePath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  persistPublicVapidFile(dir, { publicKey: record.publicKey, subject: record.subject });

  return {
    publicKey: record.publicKey,
    privateKey: record.privateKey,
    subject: record.subject,
    source: 'generated',
  };
}

/**
 * Resolve the persistence directory using the same conventions as `DB=sqlite://./data/thoth.db`
 * and `STORAGE_LOCAL_FOLDER=data/uploads`: an override env var wins, otherwise `<repo>/data`.
 * @param {string} repositoryRoot
 * @param {string | undefined} override
 * @returns {string}
 */
export function resolveVapidDirectory(repositoryRoot, override) {
  const candidate = override && override.trim().length > 0 ? override : 'data';
  return path.isAbsolute(candidate) ? candidate : path.resolve(repositoryRoot, candidate);
}

/**
 * Convenience: run `ensureVapidKeys`, and if it produced keys, splat them onto `process.env` so
 * subsequently-spawned children inherit them. Idempotent — reading env vars from the second
 * call returns the same values.
 * @param {{ repositoryRoot: string }} input
 */
export async function ensureAndInjectVapidKeys({ repositoryRoot }) {
  // WEB_PUSH_ENABLED defaults to true (matching the `bool({ default: true })` envalid schemas
  // in apps/web and apps/jobs) — only an explicit "false" disables Web Push provisioning.
  const enabled = String(process.env.WEB_PUSH_ENABLED ?? 'true').toLowerCase() !== 'false';
  const dir = resolveVapidDirectory(repositoryRoot, process.env.WEB_PUSH_VAPID_DIR);
  const result = await ensureVapidKeys({ enabled, dir, environment: process.env });
  if ('skipped' in result) {
    return result;
  }
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = result.publicKey;
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = result.privateKey;
  process.env.WEB_PUSH_VAPID_SUBJECT = result.subject;
  process.env.WEB_PUSH_VAPID_DIR = dir;
  return result;
}
