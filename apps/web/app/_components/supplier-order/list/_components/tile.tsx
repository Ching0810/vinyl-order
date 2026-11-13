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
 * One supplier order on a phone, as a record shop's product tile, two to a
 * row. Wider screens get SupplierOrderCard.
 *
 * The cover (the first record's, standing for the order) stands alone,
 * nothing laid over it. Under it, its order number with the shop as a badge
 * at the right, then its first record, and "N more records" for any others,
 * which opens them in place. Then the total with "Unpaid" and the status at
 * the end of its line, and the day with the menu at its end, in the
 * bottom-right corner. The tracking number, the note and the next step are
 * on the order's own page, which the whole tile opens — but for the menu
 * and "N more records", raised above the link.
 *
 * @param order - the order with its lines
 * @param onFailure - show why one of its actions didn't happen
 */
export default function SupplierOrderTile({
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
      flexDirection="column"
      gap="3"
      p="3"
      h="full"
      borderRadius="1rem"
      bg="gray.100"
      minW="0"
      _hover={{ bg: 'gray.200' }}
    >
      <Box w="full" aspectRatio="1">
        <Cover src={first.imageUrl} size="full" px={180} radius="10px" />
      </Box>

      <Stack gap="2">
        <HStack justify="space-between" gap="1.5">
          <LinkOverlay asChild minW="0">
            <NextLink href={`/supplier-orders/${order.id}`}>
              <Text fontWeight="semibold" color="gray.900" truncate>
                #{order.orderNumber}
              </Text>
            </NextLink>
          </LinkOverlay>
          <SupplierBadge supplier={order.supplier} />
        </HStack>
        <SupplierOrderRecord order={order} item={first} compact />
        <MoreRecords order={order} compact />
      </Stack>

      {/* Held at the bottom, so the menu ends up in the corner even when the
          tile beside it is taller. */}
      <Stack gap="1" mt="auto" pt="3" borderTopWidth="1px" borderColor="gray.200">
        <HStack justify="space-between" gap="1.5" wrap="wrap" minH="6">
          {/* Entered by hand and optional: a blank total is unknown, not zero. */}
          {order.totalCents !== null ? (
            <Text fontWeight="bold" color="gray.900">
              {formatPrice(order.totalCents, order.currency)}
            </Text>
          ) : null}
          <HStack gap="1.5" ms="auto">
            {isUnpaid(order) ? <UnpaidBadge /> : null}
            <SupplierOrderStatusBadge status={order.status} />
          </HStack>
        </HStack>
        {/* The menu shares the day's line, in the bottom-right corner, laid out
            with it rather than over it: the line takes the button's height,
            so the button never reaches the badges above. Only sideways does
            it reach into the tile's padding, where there is nothing to
            cover, so its dots line up with the badges' right edge. */}
        <HStack justify="space-between" gap="2">
          <Text fontSize="xs" color="gray.600" truncate>
            {formatDay(order.orderedAt)}
          </Text>
          <Box flexShrink="0" me="-2" position="relative" zIndex="1">
            <SupplierOrderActions order={order} onFailure={onFailure} />
          </Box>
        </HStack>
      </Stack>
    </LinkBox>
  );
}
