import { Badge } from '@chakra-ui/react';
import type { OrderStatus } from '@vinyl-order/shared';

/**
 * Label and colour per status. A Record over OrderStatus, so adding a status
 * to the shared enum fails the build here until it has a label.
 */
const STATUS: Record<OrderStatus, { label: string; palette: string }> = {
  pending: { label: 'Awaiting payment', palette: 'orange' },
  paid: { label: 'Paid', palette: 'blue' },
  shipped: { label: 'Shipped', palette: 'green' },
  cancelled: { label: 'Cancelled', palette: 'gray' },
};

/** Where an order is in its life, as a coloured badge. */
const StatusBadge = ({ status }: { status: OrderStatus }) => (
  <Badge colorPalette={STATUS[status].palette} variant="subtle" borderRadius="full" px="2.5">
    {STATUS[status].label}
  </Badge>
);

export default StatusBadge;
