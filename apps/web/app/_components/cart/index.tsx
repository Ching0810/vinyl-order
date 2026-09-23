'use client';

import { Box, Button, Flex, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useIsMutating } from '@tanstack/react-query';
import NextLink from 'next/link';

import EmptyState from '@/components/ui/empty-state';
import { formatPrice } from '@/lib/utils/currency';
import { useMe } from '@/services/queries/auth/useMe';
import { useCart } from '@/services/queries/cart/useCart';
import { useClearCart } from '@/services/queries/cart/useClearCart';
import { useRemoveCartItem } from '@/services/queries/cart/useRemoveCartItem';
import { useUpdateCartItem } from '@/services/queries/cart/useUpdateCartItem';
import { createOrderMutationKey } from '@/services/queries/orders/useCreateOrder';

import Line from './_components/line';
import PlaceOrder from './_components/place-order';
/**
 * The signed-in customer's cart.
 *
 * Totals come from the API rather than being summed here. Checkout has to
 * agree with what this page showed, and a second implementation of "what this
 * costs" is a second chance to disagree.
 *
 * Stock is surfaced per line but never blocks: reserving stock when something
 * enters a cart is its own problem (expiry, abandonment), and the real check
 * belongs in the transactional decrement at checkout. The warning here is so
 * the shopper isn't surprised there — and for the same reason it doesn't
 * disable Place order: the cart's stock may be stale, and only checkout knows.
 */
export default function CartView() {
  const { data: user, isPending: authPending } = useMe();
  const { data: cart, isPending } = useCart();

  const updateMutation = useUpdateCartItem();
  const removeMutation = useRemoveCartItem();
  const clearMutation = useClearCart();

  // Placing an order locks the lines too: an edit mid-checkout would either be
  // ignored or fail the order as CART_CHANGED.
  const placing = useIsMutating({ mutationKey: createOrderMutationKey }) > 0;
  const busy =
    updateMutation.isPending || removeMutation.isPending || clearMutation.isPending || placing;

  if (authPending) return <Skeleton h="32" borderRadius="card" />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your cart"
        body="Your cart is tied to your account, so it follows you between devices."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (isPending) {
    return (
      <Stack gap="3">
        <Skeleton h="28" borderRadius="card" />
        <Skeleton h="28" borderRadius="card" />
      </Stack>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        body="Nothing here yet. Browse the catalogue and add a record."
        cta={
          <Button asChild variant="outline" borderRadius="full">
            <NextLink href="/">Browse records</NextLink>
          </Button>
        }
      />
    );
  }

  const currency = cart.items[0].product.currency;

  return (
    <Stack gap="6">
      <Stack gap="3">
        {cart.items.map((item) => (
          <Line
            key={item.productId}
            item={item}
            busy={busy}
            onQuantityChange={(quantity) =>
              updateMutation.mutate({ productId: item.productId, quantity })
            }
            onRemove={() => removeMutation.mutate(item.productId)}
          />
        ))}
      </Stack>

      <Flex
        direction={{ base: 'column', sm: 'row' }}
        justify="space-between"
        align={{ base: 'stretch', sm: 'center' }}
        gap="4"
        pt="5"
        borderTopWidth="1px"
        borderColor="border"
      >
        <Button
          variant="ghost"
          size="sm"
          color="fg.muted"
          alignSelf="start"
          disabled={busy}
          onClick={() => clearMutation.mutate(undefined)}
        >
          Clear cart
        </Button>

        <Stack gap="4" align={{ base: 'stretch', sm: 'end' }}>
          <Box textAlign="end">
            <Text fontSize="xs" color="fg.subtle" letterSpacing="label" textTransform="uppercase">
              Subtotal · {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
            </Text>
            <Text fontSize="2xl" fontWeight="bold" letterSpacing="display">
              {formatPrice(cart.subtotalCents, currency)}
            </Text>
          </Box>
          <PlaceOrder disabled={busy} />
        </Stack>
      </Flex>
    </Stack>
  );
}
