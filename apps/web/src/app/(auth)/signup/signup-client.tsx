'use client';

import { useState } from 'react';
import { Anchor, Button, Center, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { authClient } from '@/lib/auth/client';
import { useNotification } from '@/lib/hooks/use-notification';

const signupSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

export function SignupClientPage() {
  const { showError, showSuccess } = useNotification();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignupFormValues>({
    mode: 'uncontrolled',
    initialValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validate: zod4Resolver(signupSchema),
  });

  const handleSignup = async (values: SignupFormValues) => {
    setIsLoading(true);
    try {
      const result = await authClient.signUp.email({
        name: values.name,
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        showError(result.error.message ?? 'Failed to create account');
        return;
      }

      showSuccess('Account created successfully! Redirecting...');
      // A full navigation is used here so the root layout's server-side session check runs
      // fresh for the very first authenticated request (see the comment in login-client.tsx).
      globalThis.location.assign('/pages');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account';
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Center style={{ minHeight: '100vh' }}>
      <Container size="xs" w="100%">
        <Paper shadow="md" p="xl" radius="md" withBorder>
          <Stack gap="lg">
            <div style={{ textAlign: 'center' }}>
              <Title order={2} c="var(--mantine-color-blue-6)">
                Create an Account
              </Title>
              <Text c="dimmed" size="sm" mt="xs">
                Sign up to get started with Thoth
              </Text>
            </div>

            <form onSubmit={form.onSubmit(handleSignup)}>
              <Stack gap="md">
                <TextInput
                  label="Name"
                  placeholder="Your name"
                  key={form.key('name')}
                  {...form.getInputProps('name')}
                />
                <TextInput
                  label="Email"
                  placeholder="your@email.com"
                  key={form.key('email')}
                  {...form.getInputProps('email')}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Create a password"
                  key={form.key('password')}
                  {...form.getInputProps('password')}
                />
                <PasswordInput
                  label="Confirm Password"
                  placeholder="Confirm your password"
                  key={form.key('confirmPassword')}
                  {...form.getInputProps('confirmPassword')}
                />
                <Button type="submit" fullWidth loading={isLoading}>
                  Sign Up
                </Button>
              </Stack>
            </form>

            <Text c="dimmed" size="sm" ta="center">
              Already have an account?{' '}
              <Anchor href="/login" size="sm">
                Sign in
              </Anchor>
            </Text>
          </Stack>
        </Paper>
      </Container>
    </Center>
  );
}
