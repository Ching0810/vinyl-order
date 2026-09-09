import { Badge, Box, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';

import { formatPrice } from '@/lib/utils/currency';

/**
 * One catalog tile: cover art + artist/title + year·format + price.
 * Server-renderable — purely presentational, no client state.
 *
 * The cover is the only saturated element, so the frame around it stays flat
 * until hover, when the card lifts and the art scales inside its fixed square.
 *
 * `eager` opts this tile's cover out of lazy loading. next/image lazy-loads by
 * default, which defers the request until layout proves the image is near the
 * viewport — wrong for a tile that's already on screen, since it delays the
 * Largest Contentful Paint. The grid sets it on the first row only.
 */
const Card = ({ product, eager = false }: { product: Product; eager?: boolean }) => (
  <Stack
    className="group"
    gap="0"
    borderRadius="card"
    overflow="hidden"
    bg="bg.panel"
    borderWidth="1px"
    borderColor="border.muted"
    transition="transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease"
    _hover={{ transform: 'translateY(-4px)', boxShadow: 'lift', borderColor: 'border' }}
  >
    <Box position="relative" aspectRatio="1" bg="bg.muted" overflow="hidden">
      {product.imageUrl ? (
        // Wrapper carries the zoom so the transform applies to a Chakra element
        // (next/image renders a plain <img>, which `_groupHover` can't target).
        <Box
          position="absolute"
          inset="0"
          transition="transform 0.4s ease"
          _groupHover={{ transform: 'scale(1.06)' }}
        >
          <Image
            src={product.imageUrl}
            alt={`${product.artist} – ${product.title}`}
            fill
            sizes="(max-width: 48rem) 50vw, (max-width: 62rem) 33vw, 25vw"
            style={{ objectFit: 'cover' }}
            loading={eager ? 'eager' : 'lazy'}
            // Raises the request's priority in the browser queue, beyond merely
            // not deferring it.
            fetchPriority={eager ? 'high' : undefined}
          />
        </Box>
      ) : null}

      {product.isHot ? (
        <Badge
          position="absolute"
          top="3"
          insetStart="3"
          colorPalette="brand"
          variant="solid"
          fontSize="2xs"
          letterSpacing="label"
          textTransform="uppercase"
        >
          Hot
        </Badge>
      ) : null}
    </Box>

    <Stack gap="1.5" p="4">
      <Text fontWeight="semibold" lineClamp={1} letterSpacing="display">
        {product.artist}
      </Text>
      <Text fontSize="sm" color="fg.muted" lineClamp={2} minH="10">
        {product.title}
      </Text>
      <Text fontSize="2xs" color="fg.subtle" letterSpacing="label" textTransform="uppercase">
        {[product.year, product.format[0]].filter(Boolean).join(' · ')}
      </Text>
      <Text fontWeight="bold" fontSize="lg" pt="1">
        {formatPrice(product.priceCents, product.currency)}
      </Text>
    </Stack>
  </Stack>
);

export default Card;
