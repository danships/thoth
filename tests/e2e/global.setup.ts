import { test as setup } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SEED } from './constants';

const AUTH_FILE = path.join(import.meta.dirname, '.auth/user.json');

setup('seed database and write auth storage state', async () => {
  execSync('pnpm tsx --env-file=.env.test scripts/end-to-end-seed.ts', { stdio: 'inherit' });

  const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';
  const { hostname } = new URL(baseUrl);

  // Log in via the HTTP API to get a real better-auth session cookie.
  // This avoids manually replicating the internal cookie-signing format.
  const signInResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: SEED.user.email,
      password: SEED.user.password,
    }),
  });

  if (!signInResponse.ok) {
    const body = await signInResponse.text();
    throw new Error(`Sign-in failed with status ${signInResponse.status}: ${body}`);
  }

  // Extract all Set-Cookie headers from the sign-in response.
  const setCookieHeaders: string[] =
    typeof (signInResponse.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (signInResponse.headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([signInResponse.headers.get('set-cookie')].filter(Boolean) as string[]);

  const cookies = setCookieHeaders.flatMap((header) => {
    const parts = header.split(';').map((p) => p.trim());
    const nameValue = parts[0];
    if (!nameValue) return [];
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) return [];

    const name = nameValue.slice(0, eqIndex);
    const value = nameValue.slice(eqIndex + 1);

    const attributes: Record<string, string | boolean> = {};
    for (const attribute of parts.slice(1)) {
      const attributeEqIndex = attribute.indexOf('=');
      if (attributeEqIndex === -1) {
        attributes[attribute.toLowerCase()] = true;
      } else {
        attributes[attribute.slice(0, attributeEqIndex).toLowerCase()] = attribute.slice(attributeEqIndex + 1);
      }
    }

    const maxAge = attributes['max-age'] === undefined ? undefined : Number(attributes['max-age']);

    return [
      {
        name,
        value,
        domain: hostname,
        path: (attributes['path'] as string) ?? '/',
        expires: maxAge == null ? -1 : Math.floor(Date.now() / 1000) + maxAge,
        httpOnly: attributes['httponly'] === true,
        secure: attributes['secure'] === true,
        sameSite: ((attributes['samesite'] as string) ?? 'Lax') as 'Lax' | 'Strict' | 'None',
      },
    ];
  });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(
    AUTH_FILE,
    JSON.stringify(
      {
        cookies,
        origins: [{ origin: baseUrl, localStorage: [] }],
      } satisfies import('@playwright/test').BrowserContextOptions['storageState'],
      null,
      2
    )
  );
});

