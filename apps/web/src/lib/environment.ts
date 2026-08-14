import { cleanEnv, num, str, url, bool } from 'envalid';

const environmentSchema = {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  DB: str(),
  LOG_LEVEL: str({
    choices: ['error', 'warn', 'info', 'http', 'debug', 'trace'],
    default: 'info',
  }),
  BETTER_AUTH_SECRET: str(),
  // OIDC variables are optional - if not set, credentials auth will be used
  OIDC_CLIENT_ID: str({ default: undefined }),
  OIDC_CLIENT_SECRET: str({ default: undefined }),
  OIDC_DISCOVERY_URL: url({ default: undefined }),
  OIDC_AUTHORIZATION_URL: url({ default: undefined }),
  // Number of days a soft-deleted workspace is retained before the external purge job
  // (`pnpm workspaces:purge`) permanently removes it.
  WORKSPACE_DELETE_GRACE_PERIOD_DAYS: str({ default: '30' }),
  PAGE_DELETE_GRACE_PERIOD_DAYS: str({ default: '30' }),
  // Pluggable file-storage backend used by the uploaded-file feature (THOTH-040). Only
  // `'local'` is supported today; the abstraction (`src/lib/storage`) allows adding e.g. S3
  // later without touching call sites.
  STORAGE_TYPE: str({ choices: ['local'], default: 'local' }),
  // Folder the `LocalStorageAdapter` writes uploaded file bytes to. Defaults to a folder
  // relative to the process's cwd so it works out of the box in dev/Docker alike.
  STORAGE_LOCAL_FOLDER: str({ default: 'data/uploads' }),
  // Per-file upload cap, in bytes. Default 10 MB.
  MAX_UPLOAD_SIZE_BYTES: num({ default: 10 * 1024 * 1024 }),
  // Number of hours an orphaned uploaded file (zero `file-usage` rows) is retained before the
  // external purge job (`pnpm files:purge`) permanently removes it, to tolerate in-progress
  // edits that haven't yet synced their `file-usage` rows.
  FILES_PURGE_GRACE_PERIOD_HOURS: num({ default: 24 }),
  // The public, absolute base URL Thoth is served at (e.g. `https://thoth.example.com`, no
  // trailing slash). Explicitly wired into `better-auth`'s `baseURL`/`trustedOrigins`
  // (`src/lib/auth/config.ts`) instead of relying on request-header inference, which is unsafe
  // in production (host-header spoofing). Optional — falls back to
  // `http://localhost:${PORT ?? 3000}` via `resolveAppUrl` (`src/lib/environment/app-url.ts`)
  // for local development. Must stay a runtime-only server var (never `NEXT_PUBLIC_*`), since
  // the same built Docker image is deployed at several different URLs.
  APP_URL: url({ default: undefined }),
  // THOTH-071 Web Push. `apps/web` only ever needs the *public* VAPID key (returned by
  // `GET /notifications/push-config` so the client can register a Push subscription with the
  // browser). The private key lives only in `apps/jobs`. Both processes fall back to reading
  // a shared `vapid.json` (see `scripts/ensure-vapid-keys.mjs`) if the env var is unset.
  WEB_PUSH_ENABLED: bool({ default: false }),
  WEB_PUSH_VAPID_PUBLIC_KEY: str({ default: undefined }),
  WEB_PUSH_VAPID_DIR: str({ default: undefined }),
} as const;

// `JOB_SOCKET_PATH` (THOTH-059/THOTH-060) is intentionally NOT part of this schema: it is read
// directly from `process.env` by `src/lib/jobs/health.ts`, the only consumer, so that the
// `/api/health` readiness probe never depends on (or fails because of) unrelated app
// configuration being valid. See that file for details.

type Environment = ReturnType<typeof cleanEnv<typeof environmentSchema>>;

let cachedEnvironment: Environment | null = null;

export async function getEnvironment(): Promise<Environment> {
  if (cachedEnvironment === null) {
    cachedEnvironment = cleanEnv(process.env, environmentSchema);
  }
  return cachedEnvironment;
}
