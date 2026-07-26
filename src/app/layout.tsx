import { PropsWithChildren } from 'react';
import RootClientLayout from './layout-client';
import './globals.css';

// Authenticated, workspace-scoped chrome (the `AppShell` header/navbar from
// `@/components/layout`) now lives in `src/app/[workspaceSlug]/layout.tsx`, since the sidebar's
// page tree and the navbar's workspace switcher are both workspace-scoped. This root layout
// only ever provides the app-wide client providers (Mantine, auth context, notifications); it
// applies to every route, including `(auth)` (`/login`, `/signup`) which render their own
// simple `Container` chrome instead.
export default function RootLayout({ children }: PropsWithChildren) {
  return <RootClientLayout>{children}</RootClientLayout>;
}
