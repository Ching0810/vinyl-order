import { HStack, Stack, Text } from '@chakra-ui/react';
import type { OrderItem } from '@vinyl-order/shared';
import NextLink from 'next/link';

import Cover from '@/components/order/cover';
import { formatPrice } from '@/lib/utils/currency';
/**
 * One line of a placed order, rendered only from what was copied at checkout.
 *
 * The title links to the record while it still exists; `productId` is null
 * once it has been deleted, and the line still reads the same from its
 * snapshot.
 *
 * @param item - the order line
 * @param currency - the order's currency; every line shares it
 */
export default function Line({ item, currency }: { item: OrderItem; currency: string }) {
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
      <Cover src={item.imageUrl} size={{ base: '16', md: '20' }} px={80} />

      <Stack gap="1" flex="1" minW="0">
        {item.productId ? (
          <NextLink href={`/products/${item.productId}`}>
            <Text fontWeight="semibold" truncate _hover={{ color: 'brand.fg' }}>
              {item.title}
            </Text>
          </NextLink>
        ) : (
          <Text fontWeight="semibold" truncate>
            {item.title}
          </Text>
        )}
        <Text fontSize="sm" color="fg.muted" lineClamp={1}>
          {item.artist}
        </Text>
        <Text fontSize="xs" color="fg.subtle">
          {formatPrice(item.unitPriceCents, currency)} × {item.quantity}
        </Text>
      </Stack>

      <Text fontWeight="bold" flexShrink="0">
        {formatPrice(item.lineTotalCents, currency)}
      </Text>
    </HStack>
  );
}
