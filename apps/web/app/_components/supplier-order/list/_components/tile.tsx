import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

import SupplierOrderStatusBadge from '@/components/supplier-order/status-badge';
import Cover from '@/components/ui/cover';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay } from '@/lib/utils/date';
import { isUnpaid } from '@/lib/utils/supplier-order';

import SupplierOrderActions from './actions';
import { MoreRecords, SupplierOrderRecord } from './records';
import SupplierBadge from './supplier-badge';
import UnpaidBadge from './unpaid-badge';

/**
 * One supplier order on a phone, as a record shop's product tile, two to a
 * row. Wider screens get SupplierOrderCard.
 *
 * The cover (the first record's, standing for the order) stands alone,
 * nothing laid over it. Under it, its order number with the shop as a badge
 * at the right, then its first record, and "N more records" for any others,
 * which opens them in place. Then the total with "Unpaid" and the status at
 * the end of its line, and the day. The menu sits in the bottom-right
 * corner. The tracking number, the note and the next step are left for the
 * order's own page.
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
    <Stack position="relative" gap="3" p="3" h="full" borderRadius="1rem" bg="gray.100" minW="0">
      <Box w="full" aspectRatio="1">
        <Cover src={first.imageUrl} size="full" px={180} radius="10px" />
      </Box>

      <Stack gap="2">
        <HStack justify="space-between" gap="1.5">
          <Text fontWeight="semibold" color="gray.900" truncate>
            #{order.orderNumber}
          </Text>
          <SupplierBadge supplier={order.supplier} />
        </HStack>
        <SupplierOrderRecord order={order} item={first} compact />
        <MoreRecords order={order} compact />
      </Stack>

      <Stack gap="1" pt="3" borderTopWidth="1px" borderColor="gray.200">
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
        {/* Clear of the menu in the corner. */}
        <Text fontSize="xs" color="gray.600" pe="8" truncate>
          {formatDay(order.orderedAt)}
        </Text>
      </Stack>

      <Box position="absolute" bottom="1" right="1">
        <SupplierOrderActions order={order} onFailure={onFailure} />
      </Box>
    </Stack>
  );
}
