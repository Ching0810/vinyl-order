'use client';

import { Badge, Button, Skeleton, Stack, Tabs, Text, chakra } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import RecordSupplierOrderButton from '@/components/supplier-order/record-button';
import EmptyState from '@/components/ui/empty-state';
import StatusDialog, { type StatusNotice } from '@/components/ui/status-dialog';
import {
  SUPPLIER_ORDER_STATUS,
  SUPPLIER_ORDER_TABS,
  type SupplierOrderTab,
  groupByStatus,
  ordersWithStatus,
} from '@/lib/utils/supplier-order';
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

type OnFailure = (message: string) => void;

/** How many orders a tab holds; highlighted when an urgent tab has any. */
const TabCount = ({ count, urgent }: { count: number; urgent: boolean }) => (
  <Badge
    colorPalette={urgent && count > 0 ? 'purple' : 'gray'}
    variant={urgent && count > 0 ? 'solid' : 'subtle'}
    borderRadius="full"
    size="sm"
  >
    {count}
  </Badge>
);

/** One tab's cards, or a line saying it has none. */
const OrderStack = ({ orders, onFailure }: { orders: SupplierOrder[]; onFailure: OnFailure }) =>
  orders.length > 0 ? (
    <Stack gap="3">
      {orders.map((order) => (
        <SupplierOrderCard key={order.id} order={order} onFailure={onFailure} />
      ))}
    </Stack>
  ) : (
    <Text color="fg.muted">Nothing here.</Text>
  );

/**
 * The "All" tab: every order, in a section per status, in groupByStatus's
 * order — waiting at the store first, finished orders last.
 */
const GroupedOrders = ({
  orders,
  onFailure,
}: {
  orders: SupplierOrder[];
  onFailure: OnFailure;
}) => (
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
        <OrderStack orders={group} onFailure={onFailure} />
      </chakra.section>
    ))}
  </Stack>
);

/**
 * The signed-in user's orders at the shops (tracker.md §9.2), in tabs by
 * where they stand: "All", grouped by status, and one tab per stage.
 *
 * Orders are recorded on /supplier-orders/new and changed from each card's
 * actions. Why an action failed is shown here, above the cards: a failed
 * change refreshes the list, which can move the card to another tab or
 * group and remount it, so a dialog inside the card could vanish before it
 * was read.
 *
 * @param tab - the tab to show, from the URL
 */
export default function SupplierOrderList({ tab }: { tab: SupplierOrderTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isPending: authPending } = useMe();
  const { data: orders, isPending, isError } = useSupplierOrders();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  // Stable: StatusDialog's auto-close effect depends on it, and a new function
  // each render would restart its timer.
  const closeNotice = useCallback(() => setNoticeOpen(false), []);
  const showFailure = (message: string) => {
    setNotice({ status: 'error', message });
    setNoticeOpen(true);
  };

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

  // The URL holds the tab, so a reload or Back returns to it. Replaced rather
  // than pushed: switching tabs isn't a page to go back through.
  const selectTab = (value: string) =>
    router.replace(value === 'all' ? pathname : `${pathname}?tab=${value}`, { scroll: false });

  return (
    <>
      <Tabs.Root
        value={tab}
        onValueChange={({ value }) => selectTab(value)}
        lazyMount
        unmountOnExit
      >
        <Tabs.List overflowX="auto" mb="6">
          {SUPPLIER_ORDER_TABS.map(({ value, label, statuses }) => (
            <Tabs.Trigger key={value} value={value} flexShrink="0">
              {label}
              <TabCount
                count={statuses ? ordersWithStatus(orders, statuses).length : orders.length}
                // Something waiting at the store is the one to act on.
                urgent={value === 'pickup'}
              />
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {SUPPLIER_ORDER_TABS.map(({ value, statuses }) => (
          <Tabs.Content key={value} value={value} p="0">
            {statuses ? (
              <OrderStack orders={ordersWithStatus(orders, statuses)} onFailure={showFailure} />
            ) : (
              <GroupedOrders orders={orders} onFailure={showFailure} />
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
      <StatusDialog open={noticeOpen} notice={notice} onClose={closeNotice} />
    </>
  );
}
