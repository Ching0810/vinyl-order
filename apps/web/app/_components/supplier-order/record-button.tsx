'use client';

import { Button } from '@chakra-ui/react';
import NextLink from 'next/link';

import { useMe } from '@/services/queries/auth/useMe';

/**
 * The way into the entry form. Shown only to a signed-in user — anyone else
 * is asked to sign in instead, and a button that led to a form they couldn't
 * save would only be a detour.
 */
export default function RecordSupplierOrderButton() {
  const { data: user } = useMe();
  if (!user) return null;

  return (
    // Black, as the supplier orders pages are black and white.
    <Button asChild colorPalette="gray" borderRadius="full" size="sm">
      <NextLink href="/supplier-orders/new">Record an order</NextLink>
    </Button>
  );
}
