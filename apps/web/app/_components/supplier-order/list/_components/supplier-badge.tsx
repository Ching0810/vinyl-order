import { Badge } from '@chakra-ui/react';
import type { Supplier } from '@vinyl-order/shared';

import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';

/**
 * The shop an order was placed at, as a quiet white pill beside its number:
 * the number is the order's name, the shop where it lives.
 *
 * @param supplier - the order's shop
 */
export default function SupplierBadge({ supplier }: { supplier: Supplier }) {
  return (
    <Badge
      bg="white"
      color="gray.800"
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="full"
      px="2"
      flexShrink="0"
    >
      {SUPPLIER_LABEL[supplier]}
    </Badge>
  );
}
