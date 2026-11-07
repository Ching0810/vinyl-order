'use client';

import { Container } from '@chakra-ui/react';

import PageShell from '@/components/layout/page-shell';
import SupplierOrderList from '@/components/supplier-order/list';
import SectionHeading from '@/components/ui/section-heading';

/**
 * `/supplier-orders` — the signed-in user's orders at the shops, apart from
 * the demo store's `/orders`.
 */
export default function SupplierOrdersPage() {
  return (
    <PageShell>
      <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading
          eyebrow="Your account"
          title="Supplier orders"
          description="What you've ordered at each shop, and when it's due."
        />
        <SupplierOrderList />
      </Container>
    </PageShell>
  );
}
