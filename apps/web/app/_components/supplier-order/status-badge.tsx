import { Badge, Box } from '@chakra-ui/react';
import type { SupplierOrderStatus } from '@vinyl-order/shared';

import { SUPPLIER_ORDER_STATUS } from '@/lib/utils/supplier-order';

/**
 * Where a supplier order stands: a black-and-white pill, with a dot of the
 * status's colour as the only tint, so it reads at a glance without
 * colouring the page. Its own component, not the demo store's StatusBadge:
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
      bg="white"
      color="gray.900"
      borderWidth="1px"
      borderColor="gray.900"
      borderRadius="full"
      px="2.5"
      py="0.5"
      gap="1.5"
    >
      <Box boxSize="1.5" borderRadius="full" bg="colorPalette.solid" />
      {label}
    </Badge>
  );
}
