import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getEnvironment } from '@/lib/environment';

/**
 * Read-only public-VAPID resolver for `apps/web` (THOTH-071). The web process only ever
 * exposes the *public* key (to browsers, so they can register a Push subscription). The
 * private key stays in `apps/jobs` — and, unlike an earlier version of this file, is never
 * parsed into the web process's memory either: the fallback file read below targets the
 * public-only `vapid-public.json` companion file (written by `scripts/ensure-vapid-keys.mjs`
 * alongside the full `vapid.json`), not `vapid.json` itself.
 */

const VAPID_PUBLIC_FILE_NAME = 'vapid-public.json';

let cached: { publicKey: string | null } | undefined;

function resolveDirectory(directoryEnvironment: string | undefined): string {
  const candidate = directoryEnvironment && directoryEnvironment.trim().length > 0 ? directoryEnvironment : 'data';
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

export async function getPublicVapidKey(): Promise<string | null> {
  if (cached) return cached.publicKey;
  const environment = await getEnvironment();
  if (!environment.WEB_PUSH_ENABLED) {
    cached = { publicKey: null };
    return null;
  }
  if (environment.WEB_PUSH_VAPID_PUBLIC_KEY) {
    cached = { publicKey: environment.WEB_PUSH_VAPID_PUBLIC_KEY };
    return cached.publicKey;
  }
  const directory = resolveDirectory(environment.WEB_PUSH_VAPID_DIR);
  const filePath = path.join(directory, VAPID_PUBLIC_FILE_NAME);
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed.publicKey === 'string') {
        cached = { publicKey: parsed.publicKey };
        return cached.publicKey;
      }
    } catch {
      // Malformed file — treat as unconfigured.
    }
  }
  cached = { publicKey: null };
  return null;
}

export function resetPublicVapidKeyCacheForTests(): void {
  cached = undefined;
}
