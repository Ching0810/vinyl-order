import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

import SupplierOrderActions from '@/components/supplier-order/actions';
import SupplierOrderStatusBadge from '@/components/supplier-order/status-badge';
import SupplierBadge from '@/components/supplier-order/supplier-badge';
import UnpaidBadge from '@/components/supplier-order/unpaid-badge';
import { formatDay } from '@/lib/utils/date';
import { isUnpaid } from '@/lib/utils/supplier-order';

/**
 * The order's name and where it stands: its number, whole — the list's
 * cards cut a long one short — the shop and the day, its status and
 * "Unpaid", and the same menu as its card.
 *
 * @param order - the order
 * @param onFailure - show why one of its actions didn't happen
 * @param onDeleted - leave the page once the order is gone
 */
export default function OrderHeader({
  order,
  onFailure,
  onDeleted,
}: {
  order: SupplierOrder;
  onFailure: (message: string) => void;
  onDeleted: () => void;
}) {
  return (
    <Stack gap="3" pb="5" borderBottomWidth="1px" borderColor="border">
      <HStack justify="space-between" align="start" gap="3">
        <Stack gap="2" minW="0">
          <Text textStyle="eyebrow">Supplier order</Text>
          <Heading textStyle="display" fontSize={{ base: '2xl', md: '3xl' }} wordBreak="break-all">
            #{order.orderNumber}
          </Heading>
        </Stack>
        <Box flexShrink="0">
          <SupplierOrderActions order={order} onFailure={onFailure} onDeleted={onDeleted} />
        </Box>
      </HStack>
      <HStack gap="2" wrap="wrap">
        <SupplierBadge supplier={order.supplier} />
        <Text fontSize="sm" color="fg.muted">
          Ordered {formatDay(order.orderedAt)}
        </Text>
      </HStack>
      <HStack gap="1.5" wrap="wrap">
        <SupplierOrderStatusBadge status={order.status} />
        {isUnpaid(order) ? <UnpaidBadge /> : null}
      </HStack>
    </Stack>
  );
}
