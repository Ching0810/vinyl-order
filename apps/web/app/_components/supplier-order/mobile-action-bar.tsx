'use client';

import { HStack } from '@chakra-ui/react';

import EmailImportLink from '@/components/supplier-order/email-import-link';
import RecordSupplierOrderButton from '@/components/supplier-order/record-button';
import { useMe } from '@/services/queries/auth/useMe';

/**
 * "Email import" and "Record an order" on a phone: held at the bottom of the
 * screen rather than above the list, so the orders come first and the
 * actions stay in reach while scrolling. Wider screens keep them in the
 * page heading. Signed-in users only, as the buttons are, so no empty bar.
 */
export default function SupplierOrderMobileActionBar() {
  const { data: user } = useMe();
  if (!user) return null;

  return (
    <HStack
      display={{ base: 'flex', md: 'none' }}
      position="sticky"
      bottom="0"
      justify="space-between"
      gap="2"
      mt="8"
      // Out to the container's edges, so the bar spans the screen.
      mx="-4"
      px="4"
      py="3"
      // Frosted rather than ruled off: the list shows faintly through it, and
      // a soft upward shadow separates it from the cards below.
      bg="bg/80"
      backdropFilter="blur(12px)"
      boxShadow="0 -8px 24px -12px rgb(16 14 13 / 18%)"
    >
      <EmailImportLink />
      <RecordSupplierOrderButton />
    </HStack>
  );
}
