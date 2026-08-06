'use client';
import { createAuthClient } from 'better-auth/react';

// The browser-side auth client always talks to the same origin serving the page (the Next.js
// app serves both the UI and its own `/api/auth/*` routes), so it never needs to know the
// deployment's absolute URL. Omitting `baseURL` lets it default to same-origin, which avoids
// requiring any env var (build-time or runtime) on the client bundle — necessary since the
// same built Docker image is deployed at several different URLs and nothing URL-related can be
// baked in at build time (see `APP_URL` in `src/lib/environment.ts` for the server-side
// equivalent).
export const authClient = createAuthClient({});
