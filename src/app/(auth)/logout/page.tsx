'use client';

import { Loader } from '@mantine/core';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/provider';

export default function LogoutPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  useEffect(() => {
    signOut();
    router.push('/');
  }, [router, signOut]);

  return <Loader />;
}
