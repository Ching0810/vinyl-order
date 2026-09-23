'use client';

import { Button, HStack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { CartIcon } from '@/components/ui/icons';
import StatusDialog, { type StatusNotice } from '@/components/ui/status-dialog';
import { HttpError } from '@/lib/core/http';
import { useMe } from '@/services/queries/auth/use-me';
import { useCart } from '@/services/queries/cart/use-cart';
import { useAddCartItem } from '@/services/queries/cart/use-cart-mutations';

/** The cart's own per-line ceiling (quantitySchema). */
const MAX_PER_LINE = 99;

/** Why an add failed, in the shopper's terms. */
const failureMessage = (error: unknown): string =>
  error instanceof HttpError && error.status === 401
    ? 'Your session ended. Sign in again to add this to your cart.'
    : 'Couldn’t add this to your cart. Please try again.';
/**
 * Choose how many copies, then add them to the cart.
 *
 * The stepper runs from 0 to the stock shown, matching the "N in stock" above
 * it. Add is always pressable while there is stock, and adds only what still
 * fits: the cart's line never passes the stock. Adding to a line the cart
 * already has increments it, so with 5 in stock and 2 in the cart, choosing 4
 * adds 3. When nothing fits — the cart already holds every copy, or nothing is
 * chosen — no request is sent.
 *
 * Every click ends in a StatusDialog over the page, so the shopper always
 * hears back: "Added to your cart", "Already in your cart" when there was
 * nothing left to add, or what went wrong. The chosen number stays, so
 * adding the same amount again is one click.
 *
 * All of this is guidance, not a guarantee: the stock on this page can be
 * stale, and checkout's transactional decrement is the real check.
 *
 * A signed-out visitor can still pick a quantity; the button sends them to sign
 * in, since there is no guest cart.
 *
 * @param product - the product being bought
 */
export default function AddToCart({ product }: { product: Product }) {
  const { data: user } = useMe();
  const { data: cart } = useCart();
  const router = useRouter();
  const addMutation = useAddCartItem();
  const [quantity, setQuantity] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const limit = Math.min(product.stock, MAX_PER_LINE);
  // Stock can drop under a chosen quantity after a refetch; clamp at render
  // rather than syncing state in an effect.
  const chosen = Math.min(quantity, limit);
  const inCart = cart?.items.find((item) => item.productId === product.id)?.quantity ?? 0;

  const show = (next: StatusNotice) => {
    setNotice(next);
    setDialogOpen(true);
  };

  const add = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (chosen === 0) {
      show({ status: 'error', message: 'Choose how many copies to add.' });
      return;
    }
    const fits = Math.min(chosen, limit - inCart);
    if (fits <= 0) {
      show({
        status: 'success',
        message: `Already in your cart — you have all ${limit} available ${limit === 1 ? 'copy' : 'copies'}.`,
      });
      return;
    }

    addMutation.mutate(
      { productId: product.id, quantity: fits },
      {
        onSuccess: () => show({ status: 'success', message: 'Added to your cart.' }),
        onError: (error) => show({ status: 'error', message: failureMessage(error) }),
      },
    );
  };

  if (product.stock === 0) {
    return (
      <Button size="lg" borderRadius="full" alignSelf="start" disabled>
        <CartIcon />
        Out of stock
      </Button>
    );
  }

  return (
    <>
      <HStack gap="3" wrap="wrap">
        <HStack gap="1" borderWidth="1px" borderColor="border" borderRadius="full" p="1">
          <Button
            size="sm"
            variant="ghost"
            borderRadius="full"
            aria-label="Decrease quantity"
            disabled={chosen <= 0}
            onClick={() => setQuantity(chosen - 1)}
          >
            −
          </Button>
          <Text fontWeight="semibold" minW="8" textAlign="center" aria-live="polite">
            {chosen}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            borderRadius="full"
            aria-label="Increase quantity"
            disabled={chosen >= limit}
            onClick={() => setQuantity(chosen + 1)}
          >
            +
          </Button>
        </HStack>

        <Button
          size="lg"
          colorPalette="brand"
          borderRadius="full"
          loading={addMutation.isPending}
          onClick={add}
        >
          <CartIcon />
          Add to cart
        </Button>
      </HStack>

      <StatusDialog open={dialogOpen} notice={notice} onClose={closeDialog} />
    </>
  );
}
