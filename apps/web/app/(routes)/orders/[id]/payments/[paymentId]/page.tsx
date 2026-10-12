'use client';

import { Container } from '@chakra-ui/react';
import { useParams } from 'next/navigation';

import PageShell from '@/components/layout/page-shell';
import PaymentResult from '@/components/order/payment-result';

/**
 * `/orders/[id]/payments/[paymentId]` — where the payment provider sends the
 * customer back after Pay or Decline (docs/design/payments.md §9.1). The
 * attempt is in the path so the page asks about exactly this payment.
 */
export default function PaymentResultPage() {
  const { id, paymentId } = useParams<{ id: string; paymentId: string }>();

  return (
    <PageShell>
      <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <PaymentResult orderId={id} paymentId={paymentId} />
      </Container>
    </PageShell>
  );
}
