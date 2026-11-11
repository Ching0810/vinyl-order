import { Flex, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder, SupplierOrderItem } from '@vinyl-order/shared';

import SupplierOrderStatusBadge from '@/components/supplier-order/status-badge';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay, formatMonth } from '@/lib/utils/date';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';

import SupplierOrderActions from './actions';

/** One record in the order: title, price × quantity, and when it's due if known. */
const Line = ({ item, currency }: { item: SupplierOrderItem; currency: string }) => (
  <HStack gap="3" align="start">
    <Stack gap="0" flex="1" minW="0">
      <Text fontSize="sm" fontWeight="medium" truncate>
        {item.title}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {formatPrice(item.unitPriceCents, currency)} × {item.quantity}
        {item.expectedMonth ? ` · expected ${formatMonth(item.expectedMonth)}` : ''}
      </Text>
    </Stack>
    <Text fontSize="sm" fontWeight="semibold" flexShrink="0">
      {formatPrice(item.lineTotalCents, currency)}
    </Text>
  </HStack>
);

/**
 * One supplier order, fully open: there are only a handful, and what's in
 * each and when it's due is the point of the page, so nothing hides behind a
 * click.
 *
 * The order number is plain text for now; linking it needs each shop's order
 * page URL, which is behind their login and not yet known. Its actions —
 * status, edit, delete — sit behind the "more" button.
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
  return (
    <Stack
      gap="4"
      p="4"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="card"
      bg="bg.panel"
    >
      <Flex justify="space-between" align="start" gap="4">
        <Stack gap="1" minW="0">
          <Text fontWeight="semibold">{SUPPLIER_LABEL[order.supplier]}</Text>
          <Text fontSize="sm" color="fg.muted">
            Order {order.orderNumber} · {formatDay(order.orderedAt)}
          </Text>
        </Stack>

        <HStack gap="1" align="start" flexShrink="0">
          <Stack gap="1.5" align="end">
            {/* Entered by hand and optional: a blank total is unknown, not zero. */}
            {order.totalCents !== null ? (
              <Text fontWeight="bold">{formatPrice(order.totalCents, order.currency)}</Text>
            ) : null}
            <SupplierOrderStatusBadge status={order.status} />
          </Stack>
          <SupplierOrderActions order={order} onFailure={onFailure} />
        </HStack>
      </Flex>

      <Stack gap="3" pt="4" borderTopWidth="1px" borderColor="border.muted">
        {order.items.map((item) => (
          <Line key={item.id} item={item} currency={order.currency} />
        ))}
      </Stack>

      {order.trackingNumber || order.note ? (
        <Stack gap="1" fontSize="sm" color="fg.muted">
          {order.trackingNumber ? <Text>Tracking {order.trackingNumber}</Text> : null}
          {order.note ? <Text whiteSpace="pre-wrap">{order.note}</Text> : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
