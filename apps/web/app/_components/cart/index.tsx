'use client';

import { Box, Button, Flex, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import { formatPrice } from '@/lib/utils/currency';
import { useMe } from '@/services/queries/auth/use-me';
import { useCart } from '@/services/queries/cart/use-cart';
import {
  useClearCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '@/services/queries/cart/use-cart-mutations';

import Line from './_components/line';

/** Shown when there is nothing to display, for any of several reasons. */
const Empty = ({ title, body, cta }: { title: string; body: string; cta: React.ReactNode }) => (
  <Stack gap="4" align="start" py="10">
    <Text fontSize="xl" fontWeight="semibold">
      {title}
    </Text>
    <Text color="fg.muted">{body}</Text>
    {cta}
  </Stack>
);

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
 * the shopper isn't surprised there.
 */
const CartView = () => {
  const { data: user, isPending: authPending } = useMe();
  const { data: cart, isPending } = useCart();

  const updateMutation = useUpdateCartItem();
  const removeMutation = useRemoveCartItem();
  const clearMutation = useClearCart();

  const busy = updateMutation.isPending || removeMutation.isPending || clearMutation.isPending;

  if (authPending) return <Skeleton h="32" borderRadius="card" />;

  if (!user) {
    return (
      <Empty
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
      <Empty
        title="Your cart is empty"
        body="Nothing here yet. Browse the catalogue and add a record."
        cta={
          <Button asChild variant="outline" borderRadius="full">
            <NextLink href="/products">Browse records</NextLink>
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

        <HStack gap="6" justify="end">
          <Box textAlign="end">
            <Text fontSize="xs" color="fg.subtle" letterSpacing="label" textTransform="uppercase">
              Subtotal · {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
            </Text>
            <Text fontSize="2xl" fontWeight="bold" letterSpacing="display">
              {formatPrice(cart.subtotalCents, currency)}
            </Text>
          </Box>
        </HStack>
      </Flex>
    </Stack>
  );
};

export default CartView;
