'use client';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth/provider';
import { theme } from '@/lib/theme';

// export const metadata: Metadata = {
//   title: "Thoth",
//   description: "Knowledge management system",
// };

export default function RootClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize state with localStorage value to avoid synchronous setState in effect
  const [colorScheme] = useState<'light' | 'dark' | 'auto'>(() => {
    if (globalThis.window !== undefined) {
      const storedColorScheme = localStorage.getItem('mantine-color-scheme') as 'light' | 'dark' | null;
      return storedColorScheme || 'auto';
    }
    return 'auto';
  });

  return (
    <html lang="en">
      <body>
        <MantineProvider theme={theme} defaultColorScheme={colorScheme}>
          <ModalsProvider>
            <AuthProvider>{children}</AuthProvider>
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
