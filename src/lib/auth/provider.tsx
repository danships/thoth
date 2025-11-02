'use client';

import type { User } from 'better-auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { useNotification } from '@/lib/hooks/use-notification';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { showError } = useNotification();

  const refreshSession = async () => {
    try {
      const response = await authClient.getSession();
      if (response.data?.user) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get session';
      showError(errorMessage);
      setUser(null);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      await refreshSession();
      setLoading(false);
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    try {
      await authClient.signOut();
      setUser(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign out';
      showError(errorMessage);
    }
  };

  return <AuthContext.Provider value={{ user, loading, signOut, refreshSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
