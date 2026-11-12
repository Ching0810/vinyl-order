'use client';

import { Button } from '@chakra-ui/react';
import NextLink from 'next/link';

import { useMe } from '@/services/queries/auth/useMe';

/**
 * The way to the email import setup, beside "Record an order". Signed-in
 * users only, as that button is: the page behind it needs an account.
 */
export default function EmailImportLink() {
  const { data: user } = useMe();
  if (!user) return null;

  return (
    <Button asChild variant="outline" borderRadius="full" size="sm">
      <NextLink href="/supplier-orders/import">Email import</NextLink>
    </Button>
  );
}
