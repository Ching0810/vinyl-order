'use client';

import { Badge, Box, Button, Flex, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';

import { CartIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';
import { useMe } from '@/services/queries/auth/use-me';
import { useCart } from '@/store/cart';

import AdminPanel from './_components/admin-panel';
import Related from './_components/related';

/**
 * Public product detail: cover on one side, release details and the buy action
 * on the other, with the artist's other releases below.
 *
 * The same route serves everyone. Admins additionally get the operational panel
 * (stock, feature flags, edit link); customers see only retail information. The
 * split is presentational — the API is what actually enforces it.
 *
 * @param product - the product to display
 */
const Detail = ({ product }: { product: Product }) => {
  const { data: user } = useMe();
  const addItem = useCart((state) => state.addItem);
  const isAdmin = user?.role === 'admin';
  const inStock = product.stock > 0;

  return (
    <Box>
      <Flex direction={{ base: 'column', md: 'row' }} gap={{ base: '8', md: '14' }}>
        <Box
          position="relative"
          flexShrink="0"
          w={{ base: 'full', md: '420px' }}
          aspectRatio="1"
          borderRadius="card"
          overflow="hidden"
          bg="bg.muted"
          boxShadow="card"
        >
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={`${product.artist} – ${product.title}`}
              fill
              sizes="(max-width: 48rem) 100vw, 420px"
              style={{ objectFit: 'cover' }}
              // The cover is the largest element above the fold on this route.
              loading="eager"
              fetchPriority="high"
            />
          ) : null}
        </Box>

        <Stack gap="5" flex="1" minW="0">
          {product.genres.length > 0 ? (
            <Text textStyle="eyebrow">{product.genres.join(' · ')}</Text>
          ) : null}

          <Stack gap="2">
            <Heading as="h1" textStyle="display" fontSize={{ base: '3xl', md: '5xl' }}>
              {product.artist}
            </Heading>
            <Text fontSize={{ base: 'lg', md: 'xl' }} color="fg.muted">
              {product.title}
            </Text>
          </Stack>

          {product.year || product.format.length > 0 ? (
            <HStack gap="2" wrap="wrap">
              {product.year ? <Badge variant="outline">{product.year}</Badge> : null}
              {product.format.map((entry) => (
                <Badge key={entry} variant="outline">
                  {entry}
                </Badge>
              ))}
            </HStack>
          ) : null}

          <Box borderTopWidth="1px" borderColor="border.muted" pt="5">
            <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" letterSpacing="display">
              {formatPrice(product.priceCents, product.currency)}
            </Text>
            <Text fontSize="sm" color={inStock ? 'fg.muted' : 'fg.error'} mt="1">
              {inStock ? `${product.stock} in stock` : 'Out of stock'}
            </Text>
          </Box>

          <Button
            size="lg"
            colorPalette="brand"
            borderRadius="full"
            alignSelf="start"
            disabled={!inStock}
            onClick={() => addItem(product)}
          >
            <CartIcon />
            {inStock ? 'Add to cart' : 'Out of stock'}
          </Button>

          {isAdmin ? <AdminPanel product={product} /> : null}
        </Stack>
      </Flex>

      <Related artist={product.artist} excludeId={product.id} />
    </Box>
  );
};

export default Detail;
