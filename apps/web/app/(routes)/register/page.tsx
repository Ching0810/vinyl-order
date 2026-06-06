'use client';

import { Box, Button, Field, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type RegisterInput, registerSchema } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { HttpError } from '@/lib/core/http';
import { useRegister } from '@/services/queries/auth/use-register';

const RegisterPage = () => {
  const router = useRouter();
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const onSubmit = handleSubmit((values) => {
    registerMutation.mutate(values, {
      onSuccess: () => router.push('/login'),
    });
  });

  const errorMessage = (() => {
    if (registerMutation.error instanceof HttpError && registerMutation.error.status === 409) {
      return 'That email is already registered.';
    }
    if (registerMutation.error) {
      return 'Something went wrong. Please try again.';
    }
    return null;
  })();

  return (
    <Box maxW="sm" mx="auto" mt="20" p="6">
      <Heading size="lg" mb="6">
        Create account
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
            <Input type="password" autoComplete="new-password" {...register('password')} />
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={Boolean(errors.name)}>
            <Field.Label>Name (optional)</Field.Label>
            <Input
              autoComplete="name"
              {...register('name', {
                // Empty input -> undefined so it satisfies the optional schema
                // (which requires min length 1 when a name IS provided).
                setValueAs: (value: string) => (value === '' ? undefined : value),
              })}
            />
            <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
          </Field.Root>

          {errorMessage ? <Text color="red.500">{errorMessage}</Text> : null}

          <Button type="submit" loading={registerMutation.isPending}>
            Create account
          </Button>

          <Button asChild variant="ghost">
            <NextLink href="/login">Already have an account? Sign in</NextLink>
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default RegisterPage;
