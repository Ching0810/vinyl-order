'use client';

import { Button, Dialog, Portal, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { HttpError } from '@/lib/core/http';
import { useCancelOrder } from '@/services/queries/orders/useCancelOrder';

/**
 * The Cancel order button, behind a confirmation — cancelling releases the
 * records to other customers and cannot be undone.
 *
 * A 409 needs no message of its own: the order already left `pending`
 * elsewhere, the order is refetched, and the page redraws in its new state
 * (which unmounts this button). Anything else is reported under the button.
 *
 * @param orderId - the order to cancel
 */
export default function CancelOrder({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const cancelOrder = useCancelOrder(orderId);

  const confirm = () => cancelOrder.mutate(undefined, { onSettled: () => setOpen(false) });

  const failed =
    cancelOrder.isError &&
    !(cancelOrder.error instanceof HttpError && cancelOrder.error.status === 409);

  return (
    <>
      <Button variant="outline" size="sm" borderRadius="full" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      {failed ? (
        <Text fontSize="sm" color="fg.error">
          Couldn&apos;t cancel this order. Please try again.
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
