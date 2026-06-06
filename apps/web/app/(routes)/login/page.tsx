'use client';

import { Box, Button, Field, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { HttpError } from '@/lib/core/http';
import { useLogin } from '@/services/queries/auth/use-login';

const LoginPage = () => {
  const router = useRouter();
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate(values, {
      onSuccess: () => router.push('/'),
    });
  });

  const errorMessage = (() => {
    if (loginMutation.error instanceof HttpError && loginMutation.error.status === 401) {
      return 'Invalid email or password.';
    }
    if (loginMutation.error) {
      return 'Something went wrong. Please try again.';
    }
    return null;
  })();

  return (
    <Box maxW="sm" mx="auto" mt="20" p="6">
      <Heading size="lg" mb="6">
        Sign in
      </Heading>

      <form onSubmit={onSubmit}>
        <Stack gap="4">
          <Field.Root invalid={Boolean(errors.email)}>
            <Field.Label>Email</Field.Label>
            <Input type="email" autoComplete="email" {...register('email')} />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={Boolean(errors.password)}>
            <Field.Label>Password</Field.Label>
            <Input type="password" autoComplete="current-password" {...register('password')} />
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>

          {errorMessage ? <Text color="red.500">{errorMessage}</Text> : null}

          <Button type="submit" loading={loginMutation.isPending}>
            Sign in
          </Button>

          <Button asChild variant="ghost">
            <NextLink href="/register">Create an account</NextLink>
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default LoginPage;
