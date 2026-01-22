import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const DEFAULT_DB_FILENAME = 'thoth.db';
const SECRET_FILENAME = 'secret';

/**
 * Resolves the Thoth home directory path.
 * Uses THOTH_HOME_DIR env var if set, otherwise defaults to ~/.thoth
 */
function resolveHomeDirectory() {
  const customHomeDirectory = process.env.THOTH_HOME_DIR;
  if (customHomeDirectory) {
    return customHomeDirectory;
  }
  return path.join(homedir(), '.thoth');
}

/**
 * Ensures the home directory exists, creating it if necessary.
 */
function ensureHomeDirectory(homeDirectory) {
  if (!existsSync(homeDirectory)) {
    console.log(`Creating Thoth home directory: ${homeDirectory}`);
    mkdirSync(homeDirectory, { recursive: true });
  }
}

/**
 * Resolves the database connection string.
 * Uses DB env var if set, otherwise defaults to SQLite file in home directory.
 */
function resolveDatabase(homeDirectory) {
  const database = process.env.DB;
  if (database) {
    return database;
  }

  // Default to SQLite file in home directory
  const sqlitePath = path.join(homeDirectory, DEFAULT_DB_FILENAME);
  const defaultDatabase = `sqlite://${sqlitePath}`;
  console.log(`DB not set, using default SQLite: ${defaultDatabase}`);
  return defaultDatabase;
}

/**
 * Resolves the Better Auth secret.
 * Priority:
 * 1. BETTER_AUTH_SECRET env var if set
 * 2. Read from {homeDirectory}/secret if file exists
 * 3. Generate new secret and save to {homeDirectory}/secret
 */
function resolveSecret(homeDirectory) {
  const environmentSecret = process.env.BETTER_AUTH_SECRET;
  if (environmentSecret) {
    return environmentSecret;
  }

  const secretPath = path.join(homeDirectory, SECRET_FILENAME);

  if (existsSync(secretPath)) {
    console.log(`Reading auth secret from: ${secretPath}`);
    return readFileSync(secretPath, 'utf8').trim();
  }

  console.log(`Generating new auth secret and saving to: ${secretPath}`);
  const newSecret = randomBytes(32).toString('hex');
  writeFileSync(secretPath, newSecret, { mode: 0o600 });
  return newSecret;
}

/**
 * Starts the Next.js standalone server with the resolved environment variables.
 */
function startServer(environment) {
  console.log('Starting standalone server...');

  const child = spawn('node', ['.next/standalone/server.js'], {
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });

  child.on('error', (error) => {
    console.error('Failed to start server:', error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });

  child.on('exit', (code) => {
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(code ?? 0);
  });
}

// Main execution
const homeDirectory = resolveHomeDirectory();
ensureHomeDirectory(homeDirectory);

const environment = {
  DB: resolveDatabase(homeDirectory),
  BETTER_AUTH_SECRET: resolveSecret(homeDirectory),
  // In production (start-server), skip auto-sync and use migrations
  SUPERSAVE_SKIP_SYNC: 'true',
};

startServer(environment);
