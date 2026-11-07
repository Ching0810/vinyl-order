import { Badge } from '@chakra-ui/react';
import type { SupplierOrderStatus } from '@vinyl-order/shared';

import { SUPPLIER_ORDER_STATUS } from '@/lib/utils/supplier-order';

/**
 * Where a supplier order stands, as a coloured badge. Its own component, not
 * the demo store's StatusBadge: the two kinds of order have different
 * statuses and must not read as one list.
 *
 * @param status - the order's status
 */
export default function SupplierOrderStatusBadge({ status }: { status: SupplierOrderStatus }) {
  const { label, palette } = SUPPLIER_ORDER_STATUS[status];

  return (
    <Badge colorPalette={palette} variant="subtle" borderRadius="full" px="2.5">
      {label}
    </Badge>
  );
}
