import { test as setup } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SEED } from './constants';

/**
 * Signs a cookie value using HMAC-SHA256 to match better-auth's signed cookie format.
 * Format: encodeURIComponent(`${value}.${base64HmacSha256(value, secret)}`)
 */
function signCookieValue(value: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(value).digest('base64');
  return encodeURIComponent(`${value}.${signature}`);
}

const AUTH_FILE = path.join(import.meta.dirname, '.auth/user.json');

setup('seed database and write auth storage state', async () => {
  execSync('pnpm tsx --env-file=.env.test scripts/end-to-end-seed.ts', { stdio: 'inherit' });

  const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
  const { hostname } = new URL(baseUrl);

  const secret = process.env['BETTER_AUTH_SECRET'] ?? '';
  const signedToken = signCookieValue(SEED.session.token, secret);

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(
    AUTH_FILE,
    JSON.stringify(
      {
        cookies: [
          {
            name: 'better-auth.session_token',
            value: signedToken,
            domain: hostname,
            path: '/',
            expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [
          {
            origin: baseUrl,
            localStorage: [],
          },
        ],
      } satisfies import('@playwright/test').BrowserContextOptions['storageState'],
      null,
      2
    )
  );
});
