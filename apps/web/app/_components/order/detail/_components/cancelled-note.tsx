import { Alert } from '@chakra-ui/react';
import type { CancelReason, Order } from '@vinyl-order/shared';

import { formatDateTime } from '@/lib/utils/date';

/**
 * Why the order ended, in the customer's terms. A Record over CancelReason, so
 * a new reason fails the build here until it has wording.
 */
const REASON: Record<CancelReason, string> = {
  customer: 'You cancelled this order, and its records went back on sale.',
  expired: 'Payment wasn’t completed in time, so the order was cancelled and its records released.',
};

/**
 * When and why a cancelled order was cancelled.
 *
 * @param order - a cancelled order
 */
export default function CancelledNote({ order }: { order: Order }) {
  return (
    <Alert.Root status="neutral" borderRadius="card">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          Cancelled{order.cancelledAt ? ` ${formatDateTime(order.cancelledAt)}` : ''}
        </Alert.Title>
        {order.cancelReason ? (
          <Alert.Description>{REASON[order.cancelReason]}</Alert.Description>
        ) : null}
      </Alert.Content>
    </Alert.Root>
  );
}
