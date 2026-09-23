'use client';

import { Alert, Button, List, Stack } from '@chakra-ui/react';
import { insufficientStockErrorSchema, orderErrorCodeSchema } from '@vinyl-order/shared';
import { useRouter } from 'next/navigation';

import { HttpError } from '@/lib/core/http';
import { useCreateOrder } from '@/services/queries/orders/use-create-order';

/** What went wrong, in the customer's terms. */
interface CheckoutProblem {
  title: string;
  description: string;
  /** One sentence per record that couldn't be filled. */
  lines?: string[];
}

/**
 * Turn a failed checkout into something the customer can act on.
 *
 * Branches on the 409 body's `code`, never on its message text, so rewording a
 * server message can't change what the page does. Every refusal has already
 * triggered a cart refetch, so the lines above show the current picture.
 */
const describeProblem = (error: unknown): CheckoutProblem => {
  if (error instanceof HttpError && error.status === 401) {
    return {
      title: 'You’re signed out',
      description: 'Your session ended. Sign in again, then place your order.',
    };
  }

  const body: unknown = error instanceof HttpError ? error.body : null;
  const code = orderErrorCodeSchema.safeParse((body as { code?: unknown } | null)?.code).data;

  if (code === 'INSUFFICIENT_STOCK') {
    const stock = insufficientStockErrorSchema.safeParse(body).data;
    return {
      title: 'Some records don’t have enough stock',
      description: 'Lower these quantities or remove the records, then place your order again.',
      lines: stock?.items.map(({ title, requested, available }) =>
        available === 0
          ? `${title}: sold out`
          : `${title}: you asked for ${requested}, only ${available} left`,
      ),
    };
  }
  if (code === 'CART_CHANGED') {
    return {
      title: 'Your cart changed',
      description:
        'It was updated in another tab or window while you checked out. Nothing was ordered — review your cart and try again.',
    };
  }
  if (code === 'CART_EMPTY') {
    return { title: 'Your cart is empty', description: 'There’s nothing left to order.' };
  }
  if (code === 'MIXED_CURRENCY') {
    return {
      title: 'Records are priced in different currencies',
      description: 'One order can only have one currency. Remove the records that differ.',
    };
  }
  return {
    title: 'Couldn’t place your order',
    description: 'Something went wrong on our side. Nothing was ordered — please try again.',
  };
};

/**
 * The checkout button, and why it failed when it does.
 *
 * Disabled while the request is in flight — a courtesy, not the guard. A double
 * submit that gets through anyway is caught by the server, which lets only one
 * request claim the cart's lines.
 *
 * On success the customer lands on the new order, flagged as just placed so
 * the page can say so.
 *
 * @param disabled - the cart can't be ordered as it stands (a write is in
 *   flight, or a line wants more than is in stock)
 */
const PlaceOrder = ({ disabled }: { disabled: boolean }) => {
  const router = useRouter();
  const createOrder = useCreateOrder();

  const place = () =>
    createOrder.mutate(undefined, {
      onSuccess: (order) => router.push(`/orders/${order.id}?placed=1`),
    });

  const problem = createOrder.isError ? describeProblem(createOrder.error) : null;

  return (
    <Stack gap="4" align={{ base: 'stretch', sm: 'end' }}>
      <Button
        colorPalette="brand"
        borderRadius="full"
        size="lg"
        loading={createOrder.isPending}
        loadingText="Placing order…"
        disabled={disabled}
        onClick={place}
      >
        Place order
      </Button>

      {problem ? (
        <Alert.Root status="error" maxW={{ sm: 'md' }} borderRadius="card">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{problem.title}</Alert.Title>
            <Alert.Description>
              {problem.description}
              {problem.lines?.length ? (
                <List.Root mt="2" ps="4">
                  {problem.lines.map((line) => (
                    <List.Item key={line}>{line}</List.Item>
                  ))}
                </List.Root>
              ) : null}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : null}
    </Stack>
  );
};

export default PlaceOrder;
