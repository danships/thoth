'use client';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { useEffect, useState } from 'react';
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
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'auto'>('auto');

  useEffect(() => {
    const storedColorScheme = localStorage.getItem('mantine-color-scheme') as 'light' | 'dark' | null;
    if (storedColorScheme) {
      setColorScheme(storedColorScheme);
    }
  }, []);

  return (
    <html lang="en">
      <body>
        <MantineProvider theme={theme} defaultColorScheme={colorScheme}>
          <AuthProvider>{children}</AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
