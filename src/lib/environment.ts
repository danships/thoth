import { cleanEnv, str, url } from 'envalid';

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
} as const;

type Environment = ReturnType<typeof cleanEnv<typeof environmentSchema>>;

let cachedEnvironment: Environment | null = null;

export async function getEnvironment(): Promise<Environment> {
  if (cachedEnvironment === null) {
    cachedEnvironment = cleanEnv(process.env, environmentSchema);
  }
  return cachedEnvironment;
}
