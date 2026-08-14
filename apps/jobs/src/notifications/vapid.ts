import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getEnvironment } from '../environment.js';

/**
 * Read-only VAPID key resolver for `@thoth/jobs` (THOTH-071). Prefers explicit env vars, then
 * falls back to `<dir>/vapid.json` written by the shared `scripts/ensure-vapid-keys.mjs` at
 * startup. The jobs runtime is a reader — it does NOT generate or persist keys itself.
 */

const VAPID_FILE_NAME = 'vapid.json';

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

let cached: VapidKeys | undefined;

function resolveDir(dirEnv: string | undefined): string {
  const candidate = dirEnv && dirEnv.trim().length > 0 ? dirEnv : 'data';
  // Prefer an absolute path if provided; else resolve against process cwd. `apps/jobs` and
  // `apps/web` both start from the repo root under PM2, matching `STORAGE_LOCAL_FOLDER`'s
  // convention.
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

export function getVapidKeys(): VapidKeys | undefined {
  if (cached) return cached;
  const environment = getEnvironment();
  if (!environment.WEB_PUSH_ENABLED) return undefined;
  const publicKey = environment.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = environment.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = environment.WEB_PUSH_VAPID_SUBJECT;

  if (publicKey && privateKey && subject) {
    cached = { publicKey, privateKey, subject };
    return cached;
  }

  const dir = resolveDir(environment.WEB_PUSH_VAPID_DIR);
  const filePath = path.join(dir, VAPID_FILE_NAME);
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as VapidKeys;
    if (parsed.publicKey && parsed.privateKey && parsed.subject) {
      cached = { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject: parsed.subject };
      return cached;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Test-only helper to clear the module-level cache after mutating env/files. */
export function resetVapidKeyCacheForTests(): void {
  cached = undefined;
}
