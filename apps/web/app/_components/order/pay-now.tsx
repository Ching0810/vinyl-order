'use client';

import { Button, Text } from '@chakra-ui/react';
import { useEffect } from 'react';

import { HttpError } from '@/lib/core/http';
import { useStartPayment } from '@/services/queries/payments/useStartPayment';

/** What to tell the customer when a payment could not be started. */
const failureMessage = (error: Error): string =>
  error instanceof HttpError && error.status === 502
    ? 'The payment service is unavailable. Please try again in a moment.'
    : 'Couldn’t start the payment. Please try again.';

/**
 * The Pay now button: opens a payment and sends the browser to the provider.
 *
 * It stays loading after success, while the browser leaves, so it can't be
 * pressed twice; a second press would only get the same page back anyway.
 * A 409 needs no message: the order is refetched and this button unmounts.
 *
 * @param orderId - the order to pay for
 */
export default function PayNow({ orderId }: { orderId: string }) {
  const startPayment = useStartPayment(orderId);
  const { reset } = startPayment;

  // Coming back with the browser's Back button can restore this page from the
  // back/forward cache exactly as it was left — mid-redirect, still loading.
  // Clear that, so the button works again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [reset]);

  const leaving = startPayment.isPending || startPayment.isSuccess;
  const failed =
    startPayment.isError &&
    !(startPayment.error instanceof HttpError && startPayment.error.status === 409);

  return (
    <>
      <Button
        colorPalette="brand"
        size="sm"
        borderRadius="full"
        loading={leaving}
        loadingText="Opening payment…"
        onClick={() => startPayment.mutate()}
      >
        Pay now
      </Button>
      {failed ? (
        // Sits in a wrapping row of buttons: a full-width basis puts it on a
        // line of its own, and order puts that line after every button.
        <Text fontSize="sm" color="fg.error" flexBasis="100%" order={1}>
          {failureMessage(startPayment.error)}
        </Text>
      ) : null}
    </>
  );
}
