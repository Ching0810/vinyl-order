import { Badge } from '@chakra-ui/react';
import type { CancelReason, OrderStatus } from '@vinyl-order/shared';

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

/** A cancelled order nobody paid for reads differently from one the customer ended. */
const EXPIRED = { label: 'Expired', palette: 'gray' };

/**
 * Where an order is in its life, as a coloured badge.
 *
 * @param status - the order's status
 * @param cancelReason - why it was cancelled, if it was; `expired` shows as
 *   Expired rather than Cancelled
 */
export default function StatusBadge({
  status,
  cancelReason = null,
}: {
  status: OrderStatus;
  cancelReason?: CancelReason | null;
}) {
  const badge = status === 'cancelled' && cancelReason === 'expired' ? EXPIRED : STATUS[status];

  return (
    <Badge colorPalette={badge.palette} variant="subtle" borderRadius="full" px="2.5">
      {badge.label}
    </Badge>
  );
}
