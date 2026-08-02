import type { Metadata } from 'next';
import { PropsWithChildren } from 'react';
import RootClientLayout from './layout-client';
import './globals.css';

// Every rendered page needs a `<title>` ending in " :: thoth" (THOTH-046). Server-component
// pages/layouts can override `title` directly (Next.js applies the `template` below to any
// string they set); client-component pages can't export `metadata`, so they set
// `document.title` themselves instead (see `useDocumentTitle`), formatted the same way. This
// `default` is only ever seen for the handful of routes that always redirect before rendering
// anything (e.g. `/`) or briefly before a client page's own effect runs.
export const metadata: Metadata = {
  title: {
    default: 'thoth',
    template: '%s :: thoth',
  },
};

// Authenticated, workspace-scoped chrome (the `AppShell` header/navbar from
// `@/components/layout`) now lives in `src/app/[workspaceSlug]/layout.tsx`, since the sidebar's
// page tree and the navbar's workspace switcher are both workspace-scoped. This root layout
// only ever provides the app-wide client providers (Mantine, auth context, notifications); it
// applies to every route, including `(auth)` (`/login`, `/signup`) which render their own
// simple `Container` chrome instead.
export default function RootLayout({ children }: PropsWithChildren) {
  return <RootClientLayout>{children}</RootClientLayout>;
}
