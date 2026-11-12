'use client';

import { Button, Skeleton, Stack } from '@chakra-ui/react';
import NextLink from 'next/link';

import EmptyState from '@/components/ui/empty-state';
import { useMe } from '@/services/queries/auth/useMe';

import SetupSteps from './_components/setup-steps';
import ImportTokenPanel from './_components/token-panel';

/**
 * Importing supplier orders from the shops' confirmation emails (tracker.md
 * §9.4): the user's import token, and how to set up the script that uses it.
 */
export default function SupplierOrderEmailImport() {
  const { data: user, isPending } = useMe();

  if (isPending) return <Skeleton h="96" borderRadius="card" />;
  if (!user) {
    return (
      <EmptyState
        title="Sign in to set up email import"
        body="Your import token is kept with your account."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  return (
    <Stack gap="5">
      <ImportTokenPanel />
      <SetupSteps />
    </Stack>
  );
}
