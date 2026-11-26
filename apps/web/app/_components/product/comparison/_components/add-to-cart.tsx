'use client';

import { Button } from '@chakra-ui/react';
import { type Cart, cartErrorCodeSchema } from '@vinyl-order/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import StatusDialog, { type StatusNotice } from '@/components/ui/status-dialog';
import { HttpError } from '@/lib/core/http';
import { useAddCartItem } from '@/services/queries/cart/useAddCartItem';
import { useCart } from '@/services/queries/cart/useCart';

/** Why an add failed, in the shopper's terms. */
const failureMessage = (error: unknown): string => {
  if (!(error instanceof HttpError)) return 'Couldn’t add this to your cart. Please try again.';
  if (error.status === 401) {
    return 'Your session ended. Sign in again to add this to your cart.';
  }
  // The API refuses what it can't sell; the comparison's read can be old.
  if (cartErrorCodeSchema.safeParse((error.body as { code?: unknown } | null)?.code).data) {
    return 'This version can’t be bought right now.';
  }
  return 'Couldn’t add this to your cart. Please try again.';
};

/**
 * One copy of this version into the cart; the cart's stepper sets how many.
 *
 * The comparison shows the shop's count, not what's left after the demo's
 * holds (tracker.md §8), so the API caps the line and the answer says
 * whether a copy went in. Every click ends in a StatusDialog over the page,
 * so the shopper always hears back.
 *
 * A signed-out visitor is sent to sign in, since there is no guest cart.
 *
 * @param offerId - the offer, in stock
 * @param signedIn - whether there is a cart to add to
 */
export default function AddToCart({ offerId, signedIn }: { offerId: string; signedIn: boolean }) {
  const router = useRouter();
  const { data: cart } = useCart();
  const addMutation = useAddCartItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const quantityIn = (of: Cart | undefined) =>
    of?.items.find((item) => item.offerId === offerId)?.quantity ?? 0;

  const show = (next: StatusNotice) => {
    setNotice(next);
    setDialogOpen(true);
  };

  const add = () => {
    if (!signedIn) {
      router.push('/login');
      return;
    }
    const before = quantityIn(cart);
    addMutation.mutate(
      { offerId, quantity: 1 },
      {
        onSuccess: (next) =>
          show(
            quantityIn(next) > before
              ? { status: 'success', message: 'Added to your cart.' }
              : { status: 'success', message: 'Already in your cart — no more left to add.' },
          ),
        onError: (error) => show({ status: 'error', message: failureMessage(error) }),
      },
    );
  };

  return (
    <>
      <Button
        size="xs"
        borderRadius="full"
        variant="outline"
        colorPalette="brand"
        loading={addMutation.isPending}
        onClick={add}
      >
        Add to cart
      </Button>
      <StatusDialog open={dialogOpen} notice={notice} onClose={closeDialog} />
    </>
  );
}
