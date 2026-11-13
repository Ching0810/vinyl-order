'use client';

import { Box, Container } from '@chakra-ui/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import PageShell from '@/components/layout/page-shell';
import EmailImportLink from '@/components/supplier-order/email-import-link';
import SupplierOrderList from '@/components/supplier-order/list';
import SupplierOrderMobileActionBar from '@/components/supplier-order/mobile-action-bar';
import RecordSupplierOrderButton from '@/components/supplier-order/record-button';
import SectionHeading from '@/components/ui/section-heading';
import { toStatusFilter, toSupplierFilter } from '@/lib/utils/supplier-order';

/** Reads the list's filters, `?status=` and `?shop=`, then hands them down. */
const ListFromUrl = () => {
  const params = useSearchParams();
  return (
    <SupplierOrderList
      status={toStatusFilter(params.get('status'))}
      supplier={toSupplierFilter(params.get('shop'))}
    />
  );
};

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
          meta={<EmailImportLink />}
          // The page's one action; a phone has it in
          // SupplierOrderMobileActionBar instead.
          action={
            <Box display={{ base: 'none', md: 'block' }}>
              <RecordSupplierOrderButton />
            </Box>
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
