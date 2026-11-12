import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

import SupplierOrderStatusBadge from '@/components/supplier-order/status-badge';
import Cover from '@/components/ui/cover';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay } from '@/lib/utils/date';
import { SUPPLIER_LABEL, isUnpaid, nextExpectedMonth } from '@/lib/utils/supplier-order';

import SupplierOrderActions from './actions';
import ExpectedBadge from './expected-badge';
import OtherRecords from './other-records';
import UnpaidBadge from './unpaid-badge';

/**
 * One supplier order on a phone, as a record shop's product tile, two to a
 * row. Wider screens get SupplierOrderCard.
 *
 * The cover stands alone, nothing laid over it. Under it, the same lines in
 * the same places: the first record's title (one line, cut short with an
 * ellipsis, "+N" for further records), its price × quantity with "Unpaid"
 * at the end, the status with the menu, then the total, shop, order number
 * and day. The soonest expected month comes last, only when a shop gave
 * one; a tile without it keeps the height of its row, so the two in a row
 * still match. The other records, the tracking number, the note and the
 * next step are left for the order's own page.
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
    <Stack gap="3" p="3" h="full" borderRadius="1rem" bg="gray.100" minW="0">
      <Box w="full" aspectRatio="1">
        <Cover src={first.imageUrl} size="full" px={180} radius="10px" />
      </Box>

      <Stack gap="1.5">
        <HStack gap="1.5">
          <Text flex="1" minW="0" fontSize="sm" fontWeight="semibold" color="gray.900" truncate>
            {first.title}
          </Text>
          <OtherRecords order={order} flexShrink="0" />
        </HStack>
        <HStack justify="space-between" gap="2" minH="5">
          <Text fontSize="xs" color="gray.600" truncate>
            {formatPrice(first.unitPriceCents, order.currency)} × {first.quantity}
          </Text>
          {isUnpaid(order) ? <UnpaidBadge /> : null}
        </HStack>
        <HStack justify="space-between" gap="1">
          <SupplierOrderStatusBadge status={order.status} />
          <SupplierOrderActions order={order} onFailure={onFailure} />
        </HStack>
      </Stack>

      <Stack gap="0.5" pt="2.5" borderTopWidth="1px" borderColor="gray.200">
        {/* Entered by hand and optional: a blank total is unknown, not zero. */}
        {order.totalCents !== null ? (
          <Text fontWeight="bold" color="gray.900">
            {formatPrice(order.totalCents, order.currency)}
          </Text>
        ) : null}
        <Text fontSize="xs" color="gray.600" truncate>
          {SUPPLIER_LABEL[order.supplier]} · Order {order.orderNumber}
        </Text>
        <Text fontSize="xs" color="gray.600" truncate>
          {formatDay(order.orderedAt)}
        </Text>
        <ExpectedBadge month={nextExpectedMonth(order)} alignSelf="start" mt="1.5" />
      </Stack>
    </Stack>
  );
}
