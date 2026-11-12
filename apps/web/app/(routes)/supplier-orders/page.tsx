'use client';

import { Container, HStack } from '@chakra-ui/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import PageShell from '@/components/layout/page-shell';
import EmailImportLink from '@/components/supplier-order/email-import-link';
import SupplierOrderList from '@/components/supplier-order/list';
import SupplierOrderMobileActionBar from '@/components/supplier-order/mobile-action-bar';
import RecordSupplierOrderButton from '@/components/supplier-order/record-button';
import SectionHeading from '@/components/ui/section-heading';
import { toSupplierOrderTab } from '@/lib/utils/supplier-order';

/** Reads the `?tab=` the list is showing, then hands it down. */
const ListFromUrl = () => (
  <SupplierOrderList tab={toSupplierOrderTab(useSearchParams().get('tab'))} />
);

/**
 * `/supplier-orders` — the signed-in user's orders at the shops, apart from
 * the demo store's `/orders`. `useSearchParams` needs a Suspense boundary
 * above it, so it lives here.
 */
export default function SupplierOrdersPage() {
  return (
    <PageShell>
      <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading
          eyebrow="Your account"
          title="Supplier orders"
          description="What you've ordered at each shop, and when it's due."
          action={
            // On a phone they sit in SupplierOrderMobileActionBar instead.
            <HStack gap="2" display={{ base: 'none', md: 'flex' }}>
              <EmailImportLink />
              <RecordSupplierOrderButton />
            </HStack>
          }
        />
        <Suspense fallback={null}>
          <ListFromUrl />
        </Suspense>
        <SupplierOrderMobileActionBar />
      </Container>
    </PageShell>
  );
}
