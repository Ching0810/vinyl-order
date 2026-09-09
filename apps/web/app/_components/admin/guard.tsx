'use client';

import { Center, Spinner } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { useMe } from '@/services/queries/auth/use-me';

/**
 * Client-side gate for admin pages: shows a spinner while auth resolves, then
 * redirects non-admins home. This is UX only — the API enforces real security
 * via JwtAuthGuard + RolesGuard, so a determined user gains nothing by bypassing it.
 */
const Guard = ({ children }: { children: ReactNode }) => {
  const { data: user, isPending } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && user?.role !== 'admin') {
      router.replace('/');
    }
  }, [isPending, user, router]);

  if (isPending || user?.role !== 'admin') {
    return (
      <Center minH="50vh">
        <Spinner />
      </Center>
    );
  }

  return <>{children}</>;
};

export default Guard;
