import { test as setup } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SEED } from './constants';

const AUTH_DIR = path.join(import.meta.dirname, '.auth');

async function signInAndWriteStorageState(
  baseUrl: string,
  credentials: { email: string; password: string },
  outputFile: string
) {
  const parsedBaseUrl = new URL(baseUrl);
  const { hostname } = parsedBaseUrl;
  const isHttps = parsedBaseUrl.protocol === 'https:';

  // Log in via the HTTP API to get a real better-auth session cookie.
  // This avoids manually replicating the internal cookie-signing format. Sending the exact
  // `Origin` matches a real browser request and is required for Better Auth to accept the
  // sign-in against the standalone-mode server's (THOTH-064) explicit, loopback-only trusted
  // origin (see `src/lib/auth/auth-options.ts`).
  const signInResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
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
        // Force secure: false for HTTP environments (e.g. local dev and CI) so the browser
        // sends the cookie even though the server may have returned a Secure flag in test mode.
        secure: isHttps && attributes['secure'] === true,
        sameSite: ((attributes['samesite'] as string) ?? 'Lax') as 'Lax' | 'Strict' | 'None',
      },
    ];
  });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        cookies,
        origins: [{ origin: baseUrl, localStorage: [] }],
      } satisfies import('@playwright/test').BrowserContextOptions['storageState'],
      null,
      2
    )
  );
}

setup('seed database and write auth storage state', async ({ browser }) => {
  execSync('pnpm tsx --env-file=.env.test scripts/end-to-end-seed.ts', { stdio: 'inherit' });

  const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000';

  // Primary seeded user (workspace owner) — used by the default `chromium` project.
  await signInAndWriteStorageState(baseUrl, SEED.user, path.join(AUTH_DIR, 'user.json'));

  // Warm up the dev server's on-demand (Turbopack) compilation for the sidebar/pages routes
  // before any real test starts. Without this, the very first spec to hit these routes can
  // overlap a slow first-time compile (and the resulting React Fast Refresh remount) with a
  // timing-sensitive interaction — most notably a THOTH-036 drag-and-drop — which can shift the
  // DOM mid-gesture and cause the drop's trailing `click` to land on (and navigate to) an
  // unrelated link. A real, authenticated browser navigation (rather than a plain unauthenticated
  // `fetch`, which would just hit the sign-in redirect and never compile the actual page) forces
  // that compilation to happen well before any assertions run.
  //
  // The standalone production server (THOTH-064, `PLAYWRIGHT_SERVER_MODE=standalone`) serves
  // pre-compiled routes with no Turbopack warm-up cost, so this step is skipped there.
  if (process.env['PLAYWRIGHT_SERVER_MODE'] !== 'standalone') {
    const warmupContext = await browser.newContext({ storageState: path.join(AUTH_DIR, 'user.json') });
    const warmupPage = await warmupContext.newPage();
    try {
      for (const warmupPath of [
        `/${SEED.workspace.slug}/pages`,
        `/${SEED.workspace.slug}/pages/${SEED.pages.childOverflowHost.id}`,
      ]) {
        await warmupPage.goto(`${baseUrl}${warmupPath}`).catch(() => undefined);
      }
    } finally {
      await warmupContext.close();
    }
  }
});
