'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Anchor,
  Button,
  Center,
  Container,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import type { GetAuthConfigResponse } from '@/types/api';
import { apiClient } from '@/lib/api/client';
import { authClient } from '@/lib/auth/client';
import { useNotification } from '@/lib/hooks/use-notification';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { showError } = useNotification();
  const [authMode, setAuthMode] = useState<GetAuthConfigResponse['authMode'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOidcLoading, setIsOidcLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    mode: 'uncontrolled',
    initialValues: {
      email: '',
      password: '',
    },
    validate: zodResolver(loginSchema),
  });

  useEffect(() => {
    const fetchAuthConfig = async () => {
      try {
        const response = await apiClient.get<GetAuthConfigResponse>('/config');
        setAuthMode(response.data.authMode);
      } catch {
        // Default to credentials if we can't fetch config
        setAuthMode('credentials');
      }
    };

    fetchAuthConfig();
  }, []);

  const handleCredentialsLogin = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        showError(result.error.message ?? 'Failed to sign in');
        return;
      }

      router.push('/');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in';
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOidcLogin = async () => {
    setIsOidcLoading(true);
    try {
      await authClient.signIn.social({
        provider: 'oidc',
        callbackURL: `${globalThis.location.origin}/`,
      });
    } catch (error) {
      console.error('OIDC sign-in failed:', error);
      setIsOidcLoading(false);
    }
  };

  if (authMode === null) {
    return (
      <Center style={{ minHeight: '100vh' }}>
        <Loader />
      </Center>
    );
  }

  return (
    <Center style={{ minHeight: '100vh' }}>
      <Container size="xs" w="100%">
        <Paper shadow="md" p="xl" radius="md" withBorder>
          <Stack gap="lg">
            <div style={{ textAlign: 'center' }}>
              <Title order={2} c="var(--mantine-color-blue-6)">
                Welcome to Thoth
              </Title>
              <Text c="dimmed" size="sm" mt="xs">
                Sign in to access your account
              </Text>
            </div>

            {authMode === 'credentials' && (
              <>
                <form onSubmit={form.onSubmit(handleCredentialsLogin)}>
                  <Stack gap="md">
                    <TextInput
                      label="Email"
                      placeholder="your@email.com"
                      key={form.key('email')}
                      {...form.getInputProps('email')}
                    />
                    <PasswordInput
                      label="Password"
                      placeholder="Your password"
                      key={form.key('password')}
                      {...form.getInputProps('password')}
                    />
                    <Button type="submit" fullWidth loading={isLoading}>
                      Sign In
                    </Button>
                  </Stack>
                </form>

                <Text c="dimmed" size="sm" ta="center">
                  Don&apos;t have an account?{' '}
                  <Anchor href="/signup" size="sm">
                    Sign up
                  </Anchor>
                </Text>
              </>
            )}

            {authMode === 'oidc' && (
              <Button fullWidth onClick={handleOidcLogin} loading={isOidcLoading}>
                Sign In
              </Button>
            )}
          </Stack>
        </Paper>
      </Container>
    </Center>
  );
}
