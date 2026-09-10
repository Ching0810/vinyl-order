'use client';

import { Badge, Button, HStack, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import NextLink from 'next/link';

/**
 * Operational detail and the edit entry point, rendered only for admins.
 *
 * Everything here is inventory or merchandising state — stock counts, feature
 * flags, the Discogs id — which a shopper has no use for and which the retail
 * view deliberately omits.
 *
 * This is a convenience, not a security boundary: the API enforces the real
 * one, so a customer who forced this markup to render would still be refused
 * by RolesGuard on every write.
 *
 * @param product - the product being viewed
 */
const AdminPanel = ({ product }: { product: Product }) => (
  <Stack
    gap="4"
    p="5"
    borderRadius="card"
    borderWidth="1px"
    borderStyle="dashed"
    borderColor="border"
    bg="bg.subtle"
  >
    <HStack justify="space-between" gap="4" wrap="wrap">
      <Text textStyle="eyebrow" color="fg.muted">
        Admin
      </Text>
      <Button asChild size="sm" variant="outline">
        <NextLink href={`/admin/products/${product.id}/edit`}>Edit product</NextLink>
      </Button>
    </HStack>

    <HStack gap="2" wrap="wrap">
      <Badge colorPalette={product.stock > 0 ? 'green' : 'red'}>Stock {product.stock}</Badge>
      {product.isHot ? <Badge colorPalette="brand">Hot</Badge> : null}
      {product.slideOrder !== null ? (
        <Badge colorPalette="brand">Carousel #{product.slideOrder}</Badge>
      ) : null}
      {product.discogsReleaseId ? (
        <Badge colorPalette="gray">Discogs {product.discogsReleaseId}</Badge>
      ) : null}
    </HStack>
  </Stack>
);

export default AdminPanel;
