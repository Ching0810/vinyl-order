'use client';

import { Box, Button, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import type { CartItem } from '@vinyl-order/shared';
import Image from 'next/image';
import NextLink from 'next/link';

import { CloseIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';

/**
 * One line in the cart: cover, release, unit price, a quantity stepper and the
 * line total.
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
const Line = ({
  item,
  busy,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  busy: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) => {
  const { product, quantity } = item;
  const outOfStock = product.stock === 0;
  const overStock = quantity > product.stock;

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
      <Box
        position="relative"
        boxSize={{ base: '16', md: '20' }}
        flexShrink="0"
        borderRadius="md"
        overflow="hidden"
        bg="bg.muted"
      >
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt="" fill sizes="80px" style={{ objectFit: 'cover' }} />
        ) : null}
      </Box>

      <Stack gap="1" flex="1" minW="0">
        <NextLink href={`/products/${product.id}`}>
          <Text fontWeight="semibold" truncate _hover={{ color: 'brand.fg' }}>
            {product.artist}
          </Text>
        </NextLink>
        <Text fontSize="sm" color="fg.muted" lineClamp={1}>
          {product.title}
        </Text>
        <Text fontSize="xs" color="fg.subtle">
          {formatPrice(product.priceCents, product.currency)} each
        </Text>

        {outOfStock ? (
          <Text fontSize="xs" color="fg.error">
            Out of stock — this line can&apos;t be ordered.
          </Text>
        ) : overStock ? (
          <Text fontSize="xs" color="fg.error">
            Only {product.stock} left in stock.
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
            disabled={busy || quantity >= 99}
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

        <Text fontWeight="bold">{formatPrice(item.lineTotalCents, product.currency)}</Text>
      </Stack>
    </HStack>
  );
};

export default Line;
