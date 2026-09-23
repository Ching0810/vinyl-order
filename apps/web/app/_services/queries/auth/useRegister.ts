'use client';

import { useMutation } from '@tanstack/react-query';

import { register } from '@/services/api/auth/register';

/** Register mutation. No cache priming — register doesn't log the user in. */
export const useRegister = () =>
  useMutation({
    mutationFn: register,
  });
