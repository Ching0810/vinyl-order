import { Box, HStack, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';
import NextLink from 'next/link';

import SupplierOrderActions from '@/components/supplier-order/actions';
import SupplierOrderStatusBadge from '@/components/supplier-order/status-badge';
import SupplierBadge from '@/components/supplier-order/supplier-badge';
import UnpaidBadge from '@/components/supplier-order/unpaid-badge';
import Cover from '@/components/ui/cover';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay } from '@/lib/utils/date';
import { isUnpaid } from '@/lib/utils/supplier-order';

import { MoreRecords, SupplierOrderRecord } from './records';

/**
 * One supplier order on a wide screen, as a row: a light grey card in the
 * black-and-white of a record shop's catalogue, the cover its only colour.
 * Phones get SupplierOrderTile.
 *
 * Every row has the same slots at the same height, whatever the order holds,
 * so the list reads evenly: the first record's cover, standing for the
 * order; its order number with the shop as a badge right after it, then its
 * first record with price × quantity and expected month, the day, and "N
 * more records" for any others, which opens them in place; on the right,
 * "Unpaid", the status, the menu and the total. The tracking number, the
 * note and the next step are on the order's own page, which the whole row
 * opens — but for the menu and "N more records", raised above the link.
 *
 * @param order - the order with its lines
 * @param onFailure - show why one of its actions didn't happen
 */
export default function SupplierOrderCard({
  order,
  onFailure,
}: {
  order: SupplierOrder;
  onFailure: (message: string) => void;
}) {
  const [first] = order.items;

  return (
    <LinkBox
      // Its own stacking context, so what is raised above the link stays
      // above it alone, not above the page's sticky bars.
      isolation="isolate"
      display="flex"
      gap="4"
      p="4"
      alignItems="start"
      borderRadius="1.25rem"
      bg="gray.100"
      _hover={{ bg: 'gray.200' }}
    >
      <Cover src={first.imageUrl} size="20" px={80} radius="10px" />

      <Stack gap="2" flex="1" minW="0">
        {/* The shop right after the number, not pushed to the far edge, where
            it would read as one of the status badges beside it. */}
        {/* As tall as the menu button across from it, so the two rows line up. */}
        <HStack gap="2" minW="0" minH="8">
          <LinkOverlay asChild>
            <NextLink href={`/supplier-orders/${order.id}`}>
              <Text fontSize="lg" fontWeight="semibold" color="gray.900" truncate>
                #{order.orderNumber}
              </Text>
            </NextLink>
          </LinkOverlay>
          <SupplierBadge supplier={order.supplier} />
        </HStack>
        <SupplierOrderRecord order={order} item={first} />
        <Text fontSize="sm" color="gray.600">
          {formatDay(order.orderedAt)}
        </Text>
        <MoreRecords order={order} />
      </Stack>

      <Stack gap="2" align="end" alignSelf="stretch" justify="space-between" flexShrink="0">
        <HStack gap="1.5">
          {isUnpaid(order) ? <UnpaidBadge /> : null}
          <SupplierOrderStatusBadge status={order.status} />
          <Box position="relative" zIndex="1">
            <SupplierOrderActions order={order} onFailure={onFailure} />
          </Box>
        </HStack>
        {/* Entered by hand and optional: a blank total is unknown, not zero. */}
        {order.totalCents !== null ? (
          <Text fontSize="lg" fontWeight="bold" color="gray.900">
            {formatPrice(order.totalCents, order.currency)}
          </Text>
        ) : null}
      </Stack>
    </LinkBox>
  );
}
