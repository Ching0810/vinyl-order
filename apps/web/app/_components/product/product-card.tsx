import { Badge, Box, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';

/** Format integer cents into a localized currency string (e.g. "NT$1,280").
 *  Locale is pinned so server and client render identically (no hydration drift). */
const formatPrice = (priceCents: number, currency: string): string =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(priceCents / 100);

/**
 * One catalog tile: cover art + artist/title + year·format + price.
 * Server-renderable — purely presentational, no client state.
 *
 * `eager` opts this tile's cover out of lazy loading. next/image lazy-loads by
 * default, which defers the request until layout proves the image is near the
 * viewport — wrong for a tile that's already on screen, since it delays the
 * Largest Contentful Paint. The grid sets it on the first row only.
 */
const ProductCard = ({ product, eager = false }: { product: Product; eager?: boolean }) => (
  <Box borderWidth="1px" borderRadius="md" overflow="hidden" _hover={{ shadow: 'default' }}>
    <Box position="relative" aspectRatio="1" bg="bg.muted">
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={`${product.artist} – ${product.title}`}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          style={{ objectFit: 'cover' }}
          loading={eager ? 'eager' : 'lazy'}
          // Bumps it up the browser's request queue, not just off the defer
          // list. Preferred over `preload` here because which tile is the LCP
          // element depends on viewport width (2/3/4 columns).
          fetchPriority={eager ? 'high' : undefined}
        />
      ) : null}
      {product.isHot ? (
        <Badge position="absolute" top="2" insetStart="2" colorPalette="red">
          HOT
        </Badge>
      ) : null}
    </Box>
    <Stack gap="1" p="3">
      <Text fontWeight="semibold" lineClamp={1}>
        {product.artist}
      </Text>
      <Text fontSize="sm" color="fg.muted" lineClamp={2}>
        {product.title}
      </Text>
      <Text fontSize="xs" color="fg.subtle">
        {[product.year, product.format[0]].filter(Boolean).join(' · ')}
      </Text>
      <Text fontWeight="medium">{formatPrice(product.priceCents, product.currency)}</Text>
    </Stack>
  </Box>
);

export default ProductCard;
