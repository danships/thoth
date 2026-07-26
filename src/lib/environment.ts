import { bool, cleanEnv, str, url } from 'envalid';

const environmentSchema = {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  DB: str(),
  LOG_LEVEL: str({
    choices: ['error', 'warn', 'info', 'http', 'debug', 'trace'],
    default: 'info',
  }),
  BETTER_AUTH_SECRET: str(),
  // If true, skip automatic schema sync and use migrations instead (for production)
  SUPERSAVE_SKIP_SYNC: bool({ default: false }),
  // OIDC variables are optional - if not set, credentials auth will be used
  OIDC_CLIENT_ID: str({ default: undefined }),
  OIDC_CLIENT_SECRET: str({ default: undefined }),
  OIDC_DISCOVERY_URL: url({ default: undefined }),
  OIDC_AUTHORIZATION_URL: url({ default: undefined }),
  // Number of days a soft-deleted workspace is retained before the external purge job
  // (`pnpm workspaces:purge`) permanently removes it.
  WORKSPACE_DELETE_GRACE_PERIOD_DAYS: str({ default: '30' }),
} as const;

type Environment = ReturnType<typeof cleanEnv<typeof environmentSchema>>;

let cachedEnvironment: Environment | null = null;

export async function getEnvironment(): Promise<Environment> {
  if (cachedEnvironment === null) {
    cachedEnvironment = cleanEnv(process.env, environmentSchema);
  }
  return cachedEnvironment;
}
