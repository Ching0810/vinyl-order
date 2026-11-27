'use client';

import { Button, HStack, IconButton, Link, Stack, Text } from '@chakra-ui/react';
import { type CartItem, isBuyable } from '@vinyl-order/shared';

import SupplierBadge from '@/components/supplier-order/supplier-badge';
import Cover from '@/components/ui/cover';
import { CloseIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';
import { formatTimeAgo } from '@/lib/utils/date';

/** The cart's own per-line ceiling (quantitySchema). */
const MAX_PER_LINE = 99;

/**
 * Why the line can't be ordered as it stands, if so: the shop no longer has
 * it in stock or shows no price, nothing is left to sell, or less is left
 * than the line holds.
 */
const stockWarningOf = ({ listing, quantity }: CartItem): string | null => {
  if (!isBuyable(listing.availability) || listing.priceCents === null || listing.available === 0) {
    return 'No longer in stock — this line can’t be ordered.';
  }
  if (listing.available !== null && quantity > listing.available) {
    return `Only ${listing.available} left to sell.`;
  }
  return null;
};

/**
 * One line in the cart: one shop's listing — its cover, the album and
 * artist read from its title, the shop and its own title (a link there),
 * the unit price and when it was read, a quantity stepper and the line
 * total.
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
  const { listing, quantity } = item;
  const warning = stockWarningOf(item);
  // + stops at what's left to sell (and the cart's per-line limit of 99), the
  // API's own cap; a line already over it can only come down.
  const maxQuantity = Math.min(listing.available ?? MAX_PER_LINE, MAX_PER_LINE);

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
      <Cover src={listing.imageUrl} size={{ base: '16', md: '20' }} px={80} />

      <Stack gap="1" flex="1" minW="0">
        <Text fontWeight="semibold" truncate>
          {listing.album}
        </Text>
        {listing.artist ? (
          <Text fontSize="sm" color="fg.muted" lineClamp={1}>
            {listing.artist}
          </Text>
        ) : null}
        <HStack gap="1.5" minW="0">
          <SupplierBadge supplier={listing.supplier} />
          <Link href={listing.url} target="_blank" rel="noreferrer" fontSize="xs" truncate>
            {listing.title} ↗
          </Link>
        </HStack>
        {listing.priceCents === null ? null : (
          <Text fontSize="xs" color="fg.subtle">
            {formatPrice(listing.priceCents, listing.currency)} each
            {listing.checkedAt === null ? null : ` · read ${formatTimeAgo(listing.checkedAt)}`}
          </Text>
        )}

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
            aria-label={`Remove ${listing.album} from cart`}
            disabled={busy}
            onClick={onRemove}
            ms="1"
          >
            <CloseIcon />
          </IconButton>
        </HStack>

        <Text fontWeight="bold">{formatPrice(item.lineTotalCents, listing.currency)}</Text>
      </Stack>
    </HStack>
  );
}
