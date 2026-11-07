'use client';

import { Button, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useCallback, useState } from 'react';

import RecordSupplierOrderButton from '@/components/supplier-order/record-button';
import EmptyState from '@/components/ui/empty-state';
import StatusDialog, { type StatusNotice } from '@/components/ui/status-dialog';
import { SUPPLIER_ORDER_STATUS, groupByStatus } from '@/lib/utils/supplier-order';
import { useMe } from '@/services/queries/auth/useMe';
import { useSupplierOrders } from '@/services/queries/supplier-orders/useSupplierOrders';

import SupplierOrderCard from './_components/card';

const ListSkeleton = () => (
  <Stack gap="3">
    {Array.from({ length: 3 }, (_, i) => (
      <Skeleton key={i} h="32" borderRadius="card" />
    ))}
  </Stack>
);

/**
 * The signed-in user's orders at the shops, grouped by status (tracker.md
 * §9.2): what's on its way at the top, the next arrival first within each
 * group, finished orders at the bottom. The order lives in groupByStatus.
 *
 * Orders are recorded on /supplier-orders/new and changed from each card's
 * actions. Why an action failed is shown here, above the cards: a failed
 * change refreshes the list, which can move the card to another group and
 * remount it, so a dialog inside the card could vanish before it was read.
 */
export default function SupplierOrderList() {
  const { data: user, isPending: authPending } = useMe();
  const { data: orders, isPending, isError } = useSupplierOrders();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const closeNotice = useCallback(() => setNoticeOpen(false), []);
  const showFailure = useCallback((message: string) => {
    setNotice({ status: 'error', message });
    setNoticeOpen(true);
  }, []);

  if (authPending) return <ListSkeleton />;

  if (!user) {
    return (
      <EmptyState
        title="Sign in to see your supplier orders"
        body="Keep track of what you've ordered at each shop, all in one place."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (isPending) return <ListSkeleton />;
  if (isError) {
    return <Text color="fg.error">Couldn&apos;t load your supplier orders. Please retry.</Text>;
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No supplier orders yet"
        body="Orders you record from the shops will be listed here, grouped by where they stand."
        cta={<RecordSupplierOrderButton />}
      />
    );
  }

  return (
    <Stack gap="10">
      {groupByStatus(orders).map(({ status, orders: group }) => (
        <chakra.section key={status} aria-labelledby={`supplier-orders-${status}`}>
          <Text
            id={`supplier-orders-${status}`}
            textStyle="eyebrow"
            mb="3"
            role="heading"
            aria-level={2}
          >
            {SUPPLIER_ORDER_STATUS[status].label} · {group.length}
          </Text>
          <Stack gap="3">
            {group.map((order) => (
              <SupplierOrderCard key={order.id} order={order} onFailure={showFailure} />
            ))}
          </Stack>
        </chakra.section>
      ))}
      <StatusDialog open={noticeOpen} notice={notice} onClose={closeNotice} />
    </Stack>
  );
}
