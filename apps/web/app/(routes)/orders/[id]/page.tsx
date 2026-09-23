'use client';

import { Container } from '@chakra-ui/react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import PageShell from '@/components/layout/page-shell';
import OrderDetail from '@/components/order/detail';

/** Reads the route and the `?placed=1` checkout flag, then hands both down. */
const OrderFromUrl = () => {
  const { id } = useParams<{ id: string }>();
  const placed = useSearchParams().get('placed') === '1';
  return <OrderDetail id={id} placed={placed} />;
};
/**
 * `/orders/[id]` — one order, and the confirmation page after checkout.
 * `useSearchParams` needs a Suspense boundary above it, so it lives here.
 */
export default function OrderPage() {
  return (
    <PageShell>
      <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <Suspense fallback={null}>
          <OrderFromUrl />
        </Suspense>
      </Container>
    </PageShell>
  );
}
