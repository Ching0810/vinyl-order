'use client';

import { Button, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import type { CartItem } from '@vinyl-order/shared';
import NextLink from 'next/link';

import SupplierBadge from '@/components/supplier-order/supplier-badge';
import Cover from '@/components/ui/cover';
import { CloseIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';
import { formatTimeAgo } from '@/lib/utils/date';

/** The cart's own per-line ceiling (quantitySchema). */
const MAX_PER_LINE = 99;

/**
 * Why the line can't be ordered as it stands, if so: the shop no longer has
 * it in stock, nothing is left to sell, or less is left than the line holds.
 */
const stockWarningOf = ({ offer, quantity }: CartItem): string | null => {
  if (offer.availability !== 'in_stock' || offer.available === 0) {
    return 'No longer in stock — this line can’t be ordered.';
  }
  if (offer.available !== null && quantity > offer.available) {
    return `Only ${offer.available} left to sell.`;
  }
  return null;
};

/**
 * One line in the cart: one shop's version of a record — its cover, the
 * record, the shop and its own title, the unit price and when it was read,
 * a quantity stepper and the line total.
 *
 * The stepper sends an absolute quantity rather than a delta, matching the
 * API — a retried request then lands on the same number instead of adding
 * twice. Decrementing stops at 1 because removing a line is a DELETE, not a
 * quantity of zero; "none of this" and "remove this" are one intent and the
 * contract only accepts one way to say it.
 *
 * @param item - the cart line
 * @param busy - a cart write is in flight; controls lock to avoid racing
 */
export default function Line({
  item,
  busy,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  busy: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const { offer, product, quantity } = item;
  const warning = stockWarningOf(item);
  // + stops at what's left to sell (and the cart's per-line limit of 99), the
  // API's own cap; a line already over it can only come down.
  const maxQuantity = Math.min(offer.available ?? MAX_PER_LINE, MAX_PER_LINE);

  return (
    <HStack
      gap="4"
      p="4"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="card"
      bg="bg.panel"
      align="start"
    >
      <Cover src={offer.imageUrl ?? product.imageUrl} size={{ base: '16', md: '20' }} px={80} />

      <Stack gap="1" flex="1" minW="0">
        <NextLink href={`/products/${product.id}`}>
          <Text fontWeight="semibold" truncate _hover={{ color: 'brand.fg' }}>
            {product.title}
          </Text>
        </NextLink>
        <Text fontSize="sm" color="fg.muted" lineClamp={1}>
          {product.artist}
        </Text>
        <HStack gap="1.5" minW="0">
          <SupplierBadge supplier={offer.supplier} />
          <Text fontSize="xs" color="fg.muted" truncate>
            {offer.sourceTitle}
          </Text>
        </HStack>
        <Text fontSize="xs" color="fg.subtle">
          {formatPrice(offer.priceCents, offer.currency)} each · read{' '}
          {formatTimeAgo(offer.lastCheckedAt)}
        </Text>

        {warning ? (
          <Text fontSize="xs" color="fg.error">
            {warning}
          </Text>
        ) : null}
      </Stack>

      <Stack gap="3" align="end" flexShrink="0">
        <HStack gap="1">
          <Button
            size="xs"
            variant="outline"
            aria-label="Decrease quantity"
            disabled={busy || quantity <= 1}
            onClick={() => onQuantityChange(quantity - 1)}
          >
            −
          </Button>
          <Text fontSize="sm" fontWeight="medium" minW="6" textAlign="center">
            {quantity}
          </Text>
          <Button
            size="xs"
            variant="outline"
            aria-label="Increase quantity"
            disabled={busy || quantity >= maxQuantity}
            onClick={() => onQuantityChange(quantity + 1)}
          >
            +
          </Button>
          <IconButton
            size="xs"
            variant="outline"
            colorPalette="red"
            aria-label={`Remove ${product.title} from cart`}
            disabled={busy}
            onClick={onRemove}
            ms="1"
          >
            <CloseIcon />
          </IconButton>
        </HStack>

        <Text fontWeight="bold">{formatPrice(item.lineTotalCents, offer.currency)}</Text>
      </Stack>
    </HStack>
  );
}
