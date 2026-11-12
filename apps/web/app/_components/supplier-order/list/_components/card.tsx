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
 * One supplier order on a wide screen, as a row: a light grey card in the
 * black-and-white of a record shop's catalogue, the cover its only colour.
 * Phones get SupplierOrderTile.
 *
 * Every row has the same slots at the same height, whatever the order holds,
 * so the list reads evenly: the first record's cover and title (cut short
 * with an ellipsis), its price × quantity and the soonest expected month,
 * then shop, order number and day; on the right, "Unpaid", the status, the
 * menu and the total. Further records show as "+N" on the cover; they, the
 * tracking number, the note and the next step are left for the order's own
 * page.
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
    <HStack gap="4" p="4" borderRadius="1.25rem" bg="gray.100">
      <Box position="relative" flexShrink="0">
        <Cover src={first.imageUrl} size="20" px={80} radius="10px" />
        <OtherRecords order={order} position="absolute" bottom="1" right="1" />
      </Box>

      <Stack gap="1.5" flex="1" minW="0">
        <Text fontWeight="semibold" color="gray.900" truncate>
          {first.title}
        </Text>
        <HStack gap="2" minW="0">
          <Text fontSize="sm" color="gray.600" flexShrink="0">
            {formatPrice(first.unitPriceCents, order.currency)} × {first.quantity}
          </Text>
          <ExpectedBadge month={nextExpectedMonth(order)} />
        </HStack>
        <Text fontSize="sm" color="gray.600" truncate>
          {SUPPLIER_LABEL[order.supplier]} · Order {order.orderNumber} ·{' '}
          {formatDay(order.orderedAt)}
        </Text>
      </Stack>

      <Stack gap="2" align="end" alignSelf="stretch" justify="space-between" flexShrink="0">
        <HStack gap="1.5">
          {isUnpaid(order) ? <UnpaidBadge /> : null}
          <SupplierOrderStatusBadge status={order.status} />
          <SupplierOrderActions order={order} onFailure={onFailure} />
        </HStack>
        {/* Entered by hand and optional: a blank total is unknown, not zero. */}
        {order.totalCents !== null ? (
          <Text fontSize="lg" fontWeight="bold" color="gray.900">
            {formatPrice(order.totalCents, order.currency)}
          </Text>
        ) : null}
      </Stack>
    </HStack>
  );
}
