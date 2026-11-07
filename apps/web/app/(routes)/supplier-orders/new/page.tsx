'use client';

import { Container } from '@chakra-ui/react';

import PageShell from '@/components/layout/page-shell';
import SupplierOrderForm from '@/components/supplier-order/form';
import SectionHeading from '@/components/ui/section-heading';

/** `/supplier-orders/new` — record an order placed at one of the shops. */
export default function NewSupplierOrderPage() {
  return (
    <PageShell>
      <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading eyebrow="Supplier orders" title="Record an order" />
        <SupplierOrderForm />
      </Container>
    </PageShell>
  );
}
