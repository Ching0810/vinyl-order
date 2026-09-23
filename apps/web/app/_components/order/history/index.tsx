'use client';

import { Accordion, Button, Skeleton, Stack, Text } from '@chakra-ui/react';
import type { PageArgs } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useState } from 'react';

import EmptyState from '@/components/ui/empty-state';
import Paginator from '@/components/ui/paginator';
import { useMe } from '@/services/queries/auth/useMe';
import { useOrders } from '@/services/queries/orders/useOrders';

import Row from './_components/row';

const PAGE_SIZE = 10;

const HistorySkeleton = () => (
  <Stack gap="3">
    {Array.from({ length: 3 }, (_, i) => (
      <Skeleton key={i} h="24" borderRadius="card" />
    ))}
  </Stack>
);
/**
 * The customer's orders, newest first, a page at a time.
 *
 * Each order is an accordion item: collapsed to its summary, expanded to every
 * record in it. Several can be open at once, and `lazyMount` keeps an order's
 * lines unfetched until it is first opened.
 *
 * Paging is cursor-based like the catalogue: Previous and Next step to the
 * adjacent page, and `pageNum` only tells the customer roughly where they are.
 */
export default function OrderHistory() {
  const { data: user, isPending: authPending } = useMe();
  const [args, setArgs] = useState<PageArgs>({ first: PAGE_SIZE });
  const [pageNum, setPageNum] = useState(1);
  const { data, isPending, isError, isPlaceholderData } = useOrders(args);

  if (authPending) return <HistorySkeleton />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your orders"
        body="Your order history is kept with your account."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (isPending) return <HistorySkeleton />;
  if (isError) return <Text color="fg.error">Couldn&apos;t load your orders. Please retry.</Text>;

  const orders = data.edges.map((edge) => edge.node);
  const { pageInfo } = data;

  if (orders.length === 0 && pageNum === 1) {
    return (
      <EmptyState
        title="No orders yet"
        body="When you place an order, it will be listed here."
        cta={
          <Button asChild variant="outline" borderRadius="full">
            <NextLink href="/">Browse records</NextLink>
          </Button>
        }
      />
    );
  }

  const turn = (next: PageArgs, step: number) => {
    setArgs(next);
    setPageNum((n) => Math.max(1, n + step));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Accordion.Root multiple collapsible lazyMount variant="plain">
        <Stack gap="3">
          {orders.map((order) => (
            <Row key={order.id} order={order} />
          ))}
        </Stack>
      </Accordion.Root>

      <Paginator
        pageNum={pageNum}
        hasPrevious={pageInfo.hasPreviousPage}
        hasNext={pageInfo.hasNextPage}
        busy={isPlaceholderData}
        onPrevious={() => turn({ last: PAGE_SIZE, before: pageInfo.startCursor ?? undefined }, -1)}
        onNext={() => turn({ first: PAGE_SIZE, after: pageInfo.endCursor ?? undefined }, 1)}
      />
    </>
  );
}
