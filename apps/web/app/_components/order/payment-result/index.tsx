'use client';

import { Alert, Button, HStack, Skeleton, Spinner, Stack, Text } from '@chakra-ui/react';
import type { PaymentResult as Result } from '@vinyl-order/shared';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

import PayNow from '@/components/order/pay-now';
import EmptyState from '@/components/ui/empty-state';
import SectionHeading from '@/components/ui/section-heading';
import { HttpError } from '@/lib/core/http';
import { orderReference } from '@/lib/utils/order';
import { useMe } from '@/services/queries/auth/useMe';
import { usePaymentResult } from '@/services/queries/payments/usePaymentResult';

const ViewOrder = ({ orderId }: { orderId: string }) => (
  <Button asChild variant="outline" size="sm" borderRadius="full">
    <NextLink href={`/orders/${orderId}`}>View order</NextLink>
  </Button>
);

/** One outcome: what happened, what it means, and what can be done next. */
const Outcome = ({
  status,
  indicator,
  title,
  description,
  actions,
}: {
  status: 'info' | 'success' | 'warning' | 'error';
  indicator?: ReactNode;
  title: string;
  description: string;
  actions: ReactNode;
}) => (
  <Alert.Root status={status} borderRadius="card">
    <Alert.Indicator>{indicator}</Alert.Indicator>
    <Stack flex="1" gap="3">
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
      <HStack gap="3" wrap="wrap">
        {actions}
      </HStack>
    </Stack>
  </Alert.Root>
);

/**
 * The screen for each combination of payment and order status
 * (docs/design/payments.md §9.1). `pending` is never read as a failure: it
 * only means the provider's report hasn't arrived yet.
 */
const ResultFor = ({
  result,
  timedOut,
  refresh,
  refreshing,
}: {
  result: Result;
  timedOut: boolean;
  refresh: () => void;
  refreshing: boolean;
}) => {
  const orderId = result.order.id;

  // The order ended while the payment's result was still unknown — it expired,
  // usually. Nothing more will change, so this doesn't wait.
  if (result.status === 'pending' && result.order.status === 'cancelled') {
    return (
      <Outcome
        status="warning"
        title="This order has been cancelled"
        description="It was cancelled before your payment was confirmed. If you completed the payment, it will be refunded to you."
        actions={<ViewOrder orderId={orderId} />}
      />
    );
  }

  if (result.status === 'pending' && timedOut) {
    return (
      <Outcome
        status="warning"
        title="Still processing"
        description="We haven’t heard back from the payment service yet. Your order updates on its own once we do, whether or not this page is open."
        actions={
          <>
            <Button size="sm" borderRadius="full" loading={refreshing} onClick={refresh}>
              Refresh
            </Button>
            <ViewOrder orderId={orderId} />
          </>
        }
      />
    );
  }

  if (result.status === 'pending') {
    return (
      <Outcome
        status="info"
        indicator={<Spinner size="sm" />}
        title="Confirming your payment…"
        description="This usually takes a few seconds. You can leave this page — your order updates either way."
        actions={<ViewOrder orderId={orderId} />}
      />
    );
  }

  if (result.status === 'failed') {
    const payable = result.order.status === 'pending';
    return (
      <Outcome
        status="error"
        title="Payment declined"
        description={
          payable
            ? 'The payment didn’t go through. You can try again while your records are held.'
            : 'The payment didn’t go through, and this order can no longer be paid.'
        }
        actions={
          <>
            {payable ? <PayNow orderId={orderId} /> : null}
            <ViewOrder orderId={orderId} />
          </>
        }
      />
    );
  }

  // Succeeded — but the order may have been cancelled first (§8.4).
  if (result.order.status === 'cancelled') {
    return (
      <Outcome
        status="warning"
        title="Your payment arrived after the order expired"
        description="The order had already been cancelled and its records released, so this payment will be refunded to you."
        actions={<ViewOrder orderId={orderId} />}
      />
    );
  }

  return (
    <Outcome
      status="success"
      title="Payment received"
      description="Thank you — your order is paid."
      actions={<ViewOrder orderId={orderId} />}
    />
  );
};

/**
 * Where the payment provider sends the customer back: one payment attempt's
 * result.
 *
 * Arriving here proves nothing — anyone can open the URL, and the customer is
 * usually back before the provider's webhook. So the page decides nothing on
 * its own: it shows what the API reports, and keeps asking while the payment
 * is pending.
 *
 * Someone else's payment, or one under the wrong order, is "not found", as on
 * the order page.
 *
 * @param orderId - the order, from the URL
 * @param paymentId - the attempt, from the URL the provider returned to
 */
export default function PaymentResult({
  orderId,
  paymentId,
}: {
  orderId: string;
  paymentId: string;
}) {
  const { data: user, isPending: authPending } = useMe();
  const {
    data: result,
    isPending,
    error,
    timedOut,
    refetch,
    isFetching,
  } = usePaymentResult(orderId, paymentId);

  if (authPending) return <Skeleton h="28" borderRadius="card" />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see this payment"
        body="Payments belong to the account that placed the order."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (error instanceof HttpError && error.status === 404) {
    return (
      <EmptyState
        title="We couldn’t find that payment"
        body="It may belong to another account, or the link may be mistyped."
        cta={
          <Button asChild variant="outline" borderRadius="full">
            <NextLink href="/orders">Your orders</NextLink>
          </Button>
        }
      />
    );
  }

  if (error) return <Text color="fg.error">Couldn&apos;t load this payment. Please retry.</Text>;

  return (
    <Stack gap="6">
      <SectionHeading eyebrow={`Order ${orderReference(orderId)}`} title="Payment" />
      {isPending ? (
        <Skeleton h="28" borderRadius="card" />
      ) : (
        <ResultFor
          result={result}
          timedOut={timedOut}
          refresh={() => void refetch()}
          refreshing={isFetching}
        />
      )}
    </Stack>
  );
}
