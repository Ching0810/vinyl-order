'use client';

import { Container } from '@chakra-ui/react';

import PageShell from '@/components/layout/page-shell';
import OrderHistory from '@/components/order/history';
import SectionHeading from '@/components/ui/section-heading';
/** `/orders` — the signed-in customer's order history. */
export default function OrdersPage() {
  return (
    <PageShell>
      <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading eyebrow="Your account" title="Orders" />
        <OrderHistory />
      </Container>
    </PageShell>
  );
}
