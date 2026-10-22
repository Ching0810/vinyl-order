'use client';

import { Button, Dialog, Portal, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { HttpError } from '@/lib/core/http';
import { useCancelOrder } from '@/services/queries/orders/useCancelOrder';

/** What to say under the button when cancelling failed, or nothing. */
const failureMessage = (error: Error): string | null => {
  if (!(error instanceof HttpError)) return 'Couldn’t cancel this order. Please try again.';
  // The order left `pending` elsewhere; it is refetched and redrawn.
  if (error.status === 409) return null;
  // The server couldn't ask the provider whether the order was paid, so it
  // cancelled nothing rather than guess.
  if (error.status === 502) {
    return 'Couldn’t reach the payment service, so the order wasn’t cancelled. Please try again.';
  }
  return 'Couldn’t cancel this order. Please try again.';
};

/**
 * The Cancel order button, behind a confirmation — cancelling releases the
 * records to other customers and cannot be undone.
 *
 * A 409 needs no message of its own: the order already left `pending`
 * elsewhere, the order is refetched, and the page redraws in its new state
 * (which unmounts this button) — when a payment got there first, the order
 * page says so. Anything else is reported under the button.
 *
 * @param orderId - the order to cancel
 */
export default function CancelOrder({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const cancelOrder = useCancelOrder(orderId);

  const confirm = () => cancelOrder.mutate(undefined, { onSettled: () => setOpen(false) });

  const message = cancelOrder.error ? failureMessage(cancelOrder.error) : null;

  return (
    <>
      <Button variant="outline" size="sm" borderRadius="full" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      {message ? (
        // On its own line below the row of buttons, as PayNow's message is.
        <Text fontSize="sm" color="fg.error" flexBasis="100%" order={1}>
          {message}
        </Text>
      ) : null}

      <Dialog.Root
        open={open}
        onOpenChange={(details) => setOpen(details.open)}
        role="alertdialog"
        placement="center"
        size="sm"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content borderRadius="card" mx="4">
              <Dialog.Header>
                <Dialog.Title>Cancel this order?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text color="fg.muted">
                  The records go back on sale straight away, and someone else may buy them. This
                  can&apos;t be undone.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="ghost" borderRadius="full" disabled={cancelOrder.isPending}>
                    Keep order
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="red"
                  borderRadius="full"
                  loading={cancelOrder.isPending}
                  loadingText="Cancelling…"
                  onClick={confirm}
                >
                  Cancel order
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
