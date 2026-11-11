'use client';

import { Container } from '@chakra-ui/react';
import { useParams } from 'next/navigation';

import PageShell from '@/components/layout/page-shell';
import SupplierOrderForm from '@/components/supplier-order/form';
import SectionHeading from '@/components/ui/section-heading';

/** `/supplier-orders/[id]/edit` — correct an order recorded earlier. */
export default function EditSupplierOrderPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <PageShell>
      <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading eyebrow="Supplier orders" title="Edit order" />
        <SupplierOrderForm id={id} />
      </Container>
    </PageShell>
  );
}
