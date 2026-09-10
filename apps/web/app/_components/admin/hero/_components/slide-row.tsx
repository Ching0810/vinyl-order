'use client';

import { Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';

import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';

/**
 * One row in the carousel running order: position, cover, release, and the
 * controls to move or remove it.
 *
 * @param product - the slide's product
 * @param position - zero-based place in the running order
 * @param isFirst - disables "move up"
 * @param isLast - disables "move down"
 * @param busy - a write is in flight; controls lock to avoid racing writes
 */
const SlideRow = ({
  product,
  position,
  isFirst,
  isLast,
  busy,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  product: Product;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) => (
  <HStack
    gap="4"
    p="3"
    borderWidth="1px"
    borderColor="border.muted"
    borderRadius="card"
    bg="bg.panel"
  >
    <Text w="7" textAlign="center" fontWeight="bold" fontSize="sm" color="fg.subtle" flexShrink="0">
      {position + 1}
    </Text>

    <Box
      position="relative"
      boxSize="12"
      flexShrink="0"
      borderRadius="md"
      overflow="hidden"
      bg="bg.muted"
    >
      {product.imageUrl ? (
        <Image src={product.imageUrl} alt="" fill sizes="48px" style={{ objectFit: 'cover' }} />
      ) : null}
    </Box>

    <Stack gap="0.5" flex="1" minW="0">
      <Text fontWeight="semibold" truncate>
        {product.artist}
      </Text>
      <Text fontSize="sm" color="fg.muted" truncate>
        {product.title}
      </Text>
    </Stack>

    <Text fontSize="sm" color="fg.muted" flexShrink="0" display={{ base: 'none', sm: 'block' }}>
      {formatPrice(product.priceCents, product.currency)}
    </Text>

    <HStack gap="1" flexShrink="0">
      <IconButton
        aria-label={`Move ${product.title} up`}
        size="xs"
        variant="outline"
        disabled={isFirst || busy}
        onClick={onMoveUp}
      >
        <ChevronUpIcon />
      </IconButton>
      <IconButton
        aria-label={`Move ${product.title} down`}
        size="xs"
        variant="outline"
        disabled={isLast || busy}
        onClick={onMoveDown}
      >
        <ChevronDownIcon />
      </IconButton>
      <IconButton
        aria-label={`Remove ${product.title} from the carousel`}
        size="xs"
        variant="outline"
        colorPalette="red"
        disabled={busy}
        onClick={onRemove}
      >
        <CloseIcon />
      </IconButton>
    </HStack>
  </HStack>
);

export default SlideRow;
