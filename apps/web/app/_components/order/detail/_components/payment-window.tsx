'use client';

import { Alert, HStack, Stack } from '@chakra-ui/react';
import type { Order } from '@vinyl-order/shared';

import { useCountdown } from '@/hooks/useCountdown';
import { formatCountdown, formatDateTime } from '@/lib/utils/date';

import CancelOrder from './cancel-order';

/**
 * A pending order's deadline: how long is left to pay, and the way out.
 *
 * Once the countdown reaches zero the order is still `pending` until the
 * server's expiry sweep cancels it, which can take up to a minute. The page
 * says so rather than claiming it is cancelled, and useOrder keeps refetching
 * until the server confirms.
 *
 * @param order - a pending order
 */
export default function PaymentWindow({ order }: { order: Order }) {
  const remaining = useCountdown(order.expiresAt);

  // Before hydration there is no clock to count with; the deadline itself
  // still reads correctly.
  if (remaining === null) {
    return (
      <Alert.Root status="warning" borderRadius="card">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Awaiting payment</Alert.Title>
          <Alert.Description>Pay by {formatDateTime(order.expiresAt)}.</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  if (remaining === 0) {
    return (
      <Alert.Root status="neutral" borderRadius="card">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>The payment window has closed</Alert.Title>
          <Alert.Description>
            This order is being cancelled and its records released. This page updates on its own.
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  return (
    <Alert.Root status="warning" borderRadius="card">
      <Alert.Indicator />
      <Stack flex="1" gap="3">
        <Alert.Content>
          <Alert.Title>Pay within {formatCountdown(remaining)}</Alert.Title>
          <Alert.Description>
            Your records are held until {formatDateTime(order.expiresAt)}. After that the order is
            cancelled and they go back on sale.
          </Alert.Description>
        </Alert.Content>
        <HStack gap="3" wrap="wrap">
          <CancelOrder orderId={order.id} />
        </HStack>
      </Stack>
    </Alert.Root>
  );
}
