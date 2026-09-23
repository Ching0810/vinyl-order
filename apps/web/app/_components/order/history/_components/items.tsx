'use client';

import { Button, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import Cover from '@/components/order/cover';
import { formatPrice } from '@/lib/utils/currency';
import { useOrder } from '@/services/queries/orders/use-order';
/**
 * Every line of one order, shown when its history row is expanded.
 *
 * Mounted only once the row is first opened (the accordion lazy-mounts), so
 * the history page loads summaries alone and fetches an order's lines on
 * demand. The result is the same cache entry the detail page uses, so opening
 * "View order" afterwards needs no second request.
 *
 * @param id - the order to load
 */
export default function Items({ id }: { id: string }) {
  const { data: order, isPending, isError } = useOrder(id);

  if (isPending) {
    return (
      <Stack gap="2">
        <Skeleton h="10" />
        <Skeleton h="10" />
      </Stack>
    );
  }
  if (isError) {
    return (
      <Text fontSize="sm" color="fg.error">
        Couldn&apos;t load this order&apos;s records. Please retry.
      </Text>
    );
  }

  return (
    <Stack gap="3">
      {order.items.map((item) => (
        <HStack key={item.id} gap="3" align="center">
          <Cover src={item.imageUrl} size="10" px={40} />
          <Stack gap="0" flex="1" minW="0">
            <Text fontSize="sm" fontWeight="medium" truncate>
              {item.title}
            </Text>
            <Text fontSize="xs" color="fg.muted" truncate>
              {item.artist} · {formatPrice(item.unitPriceCents, order.currency)} × {item.quantity}
            </Text>
          </Stack>
          <Text fontSize="sm" fontWeight="semibold" flexShrink="0">
            {formatPrice(item.lineTotalCents, order.currency)}
          </Text>
        </HStack>
      ))}

      <Button asChild variant="outline" size="sm" borderRadius="full" alignSelf="end">
        <NextLink href={`/orders/${order.id}`}>View order</NextLink>
      </Button>
    </Stack>
  );
}
