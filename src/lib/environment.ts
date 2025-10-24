import { cleanEnv, str, url } from 'envalid';

const environmentSchema = {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  DB: str(),
  LOG_LEVEL: str({
    choices: ['error', 'warn', 'info', 'http', 'debug', 'trace'],
    default: 'info',
  }),
  BETTER_AUTH_SECRET: str(),
  OIDC_CLIENT_ID: str(),
  OIDC_CLIENT_SECRET: str(),
  OIDC_DISCOVERY_URL: url(),
  OIDC_AUTHORIZATION_URL: url(),
} as const;

type Environment = ReturnType<typeof cleanEnv<typeof environmentSchema>>;

let cachedEnvironment: Environment | null = null;

export function getEnvironment(): Environment {
  if (cachedEnvironment === null) {
    cachedEnvironment = cleanEnv(process.env, environmentSchema);
  }
  return cachedEnvironment;
}
