import { Badge } from '@chakra-ui/react';
import type { SupplierOrderStatus } from '@vinyl-order/shared';

import { SUPPLIER_ORDER_STATUS } from '@/lib/utils/supplier-order';

/**
 * Where a supplier order stands, as a pill in its status's colour: tinted
 * text, background and border, the only colour on the black-and-white page
 * besides the covers. Its own component, not the demo store's StatusBadge:
 * the two kinds of order have different statuses and must not read as one
 * list.
 *
 * @param status - the order's status
 */
export default function SupplierOrderStatusBadge({ status }: { status: SupplierOrderStatus }) {
  const { label, palette } = SUPPLIER_ORDER_STATUS[status];

  return (
    <Badge
      colorPalette={palette}
      bg="colorPalette.subtle"
      color="colorPalette.fg"
      borderWidth="1px"
      borderColor="colorPalette.muted"
      borderRadius="full"
      px="2.5"
      py="0.5"
    >
      {label}
    </Badge>
  );
}
