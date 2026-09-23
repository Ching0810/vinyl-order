'use client';

import { Alert, Box, Button, Flex, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import StatusBadge from '@/components/order/status-badge';
import EmptyState from '@/components/ui/empty-state';
import SectionHeading from '@/components/ui/section-heading';
import { HttpError } from '@/lib/core/http';
import { formatPrice } from '@/lib/utils/currency';
import { formatDateTime } from '@/lib/utils/date';
import { orderReference } from '@/lib/utils/order';
import { useMe } from '@/services/queries/auth/use-me';
import { useOrder } from '@/services/queries/orders/use-order';

import Line from './_components/line';

const DetailSkeleton = () => (
  <Stack gap="3">
    <Skeleton h="10" w="60%" />
    <Skeleton h="28" borderRadius="card" />
    <Skeleton h="28" borderRadius="card" />
  </Stack>
);

/**
 * One of the customer's orders: status, date, every line and the total —
 * all from what was copied at checkout, so it reads the same after a record is
 * repriced or removed.
 *
 * Also the confirmation page: checkout lands here with `placed`, and the order
 * is already in the cache from the checkout response, so it renders at once.
 *
 * Someone else's order and a missing one get the same "not found" — the API
 * doesn't say which, and neither does the page.
 *
 * @param id - the order's id, from the URL
 * @param placed - arrived straight from checkout
 */
const OrderDetail = ({ id, placed }: { id: string; placed: boolean }) => {
  const { data: user, isPending: authPending } = useMe();
  const { data: order, isPending, error } = useOrder(id);

  if (authPending) return <DetailSkeleton />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see this order"
        body="Orders belong to the account that placed them."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (error instanceof HttpError && error.status === 404) {
    return (
      <EmptyState
        title="We couldn’t find that order"
        body="It may belong to another account, or the link may be mistyped."
        cta={
          <Button asChild variant="outline" borderRadius="full">
            <NextLink href="/orders">Your orders</NextLink>
          </Button>
        }
      />
    );
  }

  if (error) return <Text color="fg.error">Couldn&apos;t load this order. Please retry.</Text>;
  if (isPending) return <DetailSkeleton />;

  return (
    <Stack gap="6">
      {placed ? (
        <Alert.Root status="success" borderRadius="card">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Thank you — your order is placed</Alert.Title>
            <Alert.Description>
              These records are set aside for you. You can find this order any time under Orders.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}

      <SectionHeading
        eyebrow={`Order ${orderReference(order.id)}`}
        title={placed ? 'Order confirmed' : 'Order details'}
        action={
          <Button asChild variant="ghost" size="sm" color="fg.muted">
            <NextLink href="/orders">All orders</NextLink>
          </Button>
        }
      />

      <HStack gap="3" wrap="wrap">
        <StatusBadge status={order.status} />
        <Text fontSize="sm" color="fg.muted">
          Placed {formatDateTime(order.createdAt)}
        </Text>
      </HStack>

      <Stack gap="3">
        {order.items.map((item) => (
          <Line key={item.id} item={item} currency={order.currency} />
        ))}
      </Stack>

      <Flex justify="end" pt="5" borderTopWidth="1px" borderColor="border">
        <Box textAlign="end">
          <Text fontSize="xs" color="fg.subtle" letterSpacing="label" textTransform="uppercase">
            Subtotal · {order.lineCount} {order.lineCount === 1 ? 'record' : 'records'}
          </Text>
          <Text fontSize="2xl" fontWeight="bold" letterSpacing="display">
            {formatPrice(order.subtotalCents, order.currency)}
          </Text>
        </Box>
      </Flex>
    </Stack>
  );
};

export default OrderDetail;
