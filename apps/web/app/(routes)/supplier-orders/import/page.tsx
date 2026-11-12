'use client';

import { Container } from '@chakra-ui/react';

import PageShell from '@/components/layout/page-shell';
import SupplierOrderEmailImport from '@/components/supplier-order/email-import';
import SectionHeading from '@/components/ui/section-heading';

/** `/supplier-orders/import` — set up importing orders from confirmation emails. */
export default function SupplierOrderEmailImportPage() {
  return (
    <PageShell>
      <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading
          eyebrow="Supplier orders"
          title="Email import"
          description="Record orders from the shops' confirmation emails, without typing them in."
        />
        <SupplierOrderEmailImport />
      </Container>
    </PageShell>
  );
}
