'use client';

import { Box, Button, HStack, SimpleGrid, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import RecordSupplierOrderButton from '@/components/supplier-order/record-button';
import EmptyState from '@/components/ui/empty-state';
import StatusDialog, { type StatusNotice } from '@/components/ui/status-dialog';
import {
  STATUS_FILTERS,
  SUPPLIER_ORDER_STATUS,
  type StatusFilter,
  type SupplierFilter,
  groupByStatus,
  ordersAtShop,
  ordersWithStatus,
} from '@/lib/utils/supplier-order';
import { useMe } from '@/services/queries/auth/useMe';
import { useSupplierOrders } from '@/services/queries/supplier-orders/useSupplierOrders';

import SupplierOrderCard from './_components/card';
import SupplierOrderFilters from './_components/filters';
import SupplierOrderTile from './_components/tile';

const ListSkeleton = () => (
  <Stack gap="3">
    {Array.from({ length: 3 }, (_, i) => (
      <Skeleton key={i} h="36" borderRadius="1.25rem" />
    ))}
  </Stack>
);

type OnFailure = (message: string) => void;

/**
 * Orders under the chosen filters, or a line saying there are none: tiles two to a row on a
 * phone, row cards on a wider screen. Both are rendered and switched with
 * `display`, not useBreakpointValue, which would hydrate mismatched (see
 * product/search).
 */
const OrderStack = ({ orders, onFailure }: { orders: SupplierOrder[]; onFailure: OnFailure }) =>
  orders.length > 0 ? (
    <>
      <SimpleGrid display={{ base: 'grid', md: 'none' }} columns={2} gap="3">
        {orders.map((order) => (
          <SupplierOrderTile key={order.id} order={order} onFailure={onFailure} />
        ))}
      </SimpleGrid>
      <Stack display={{ base: 'none', md: 'flex' }} gap="4">
        {orders.map((order) => (
          <SupplierOrderCard key={order.id} order={order} onFailure={onFailure} />
        ))}
      </Stack>
    </>
  ) : (
    <Text color="gray.600">Nothing here.</Text>
  );

/**
 * "All statuses": every order, in a section per status, in groupByStatus's
 * order — waiting at the store first, finished orders last.
 */
const GroupedOrders = ({
  orders,
  onFailure,
}: {
  orders: SupplierOrder[];
  onFailure: OnFailure;
}) => (
  <Stack gap="8">
    {groupByStatus(orders).map(({ status, orders: group }) => (
      <chakra.section key={status} aria-labelledby={`supplier-orders-${status}`}>
        <HStack gap="2" mb="3" colorPalette={SUPPLIER_ORDER_STATUS[status].palette}>
          <Box boxSize="2" borderRadius="full" bg="colorPalette.solid" />
          <Text
            id={`supplier-orders-${status}`}
            fontWeight="semibold"
            fontSize="lg"
            color="gray.900"
            role="heading"
            aria-level={2}
          >
            {SUPPLIER_ORDER_STATUS[status].label}
          </Text>
          <Text color="gray.500" fontSize="sm">
            {group.length}
          </Text>
        </HStack>
        <OrderStack orders={group} onFailure={onFailure} />
      </chakra.section>
    ))}
  </Stack>
);

/**
 * The signed-in user's orders at the shops (tracker.md §9.2), filtered by
 * where they stand and by shop: "All statuses" grouped by status, any other
 * choice as one list.
 *
 * Orders are recorded on /supplier-orders/new and changed from each card's
 * actions. Why an action failed is shown here, above the cards: a failed
 * change refreshes the list, which can move the card out of the filter or
 * into another group and remount it, so a dialog inside the card could
 * vanish before it was read.
 *
 * @param status - the status filter, from the URL
 * @param supplier - the shop filter, from the URL
 */
export default function SupplierOrderList({
  status,
  supplier,
}: {
  status: StatusFilter;
  supplier: SupplierFilter;
}) {
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

  // The URL holds the filters, so a reload or Back returns to them. Replaced
  // rather than pushed: choosing a filter isn't a page to go back through.
  const select = (next: { status: StatusFilter; supplier: SupplierFilter }) => {
    const query = new URLSearchParams();
    if (next.status !== 'all') query.set('status', next.status);
    if (next.supplier !== 'all') query.set('shop', next.supplier);
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const atShop = ordersAtShop(orders, supplier);
  const { statuses } = STATUS_FILTERS.find((filter) => filter.value === status)!;

  return (
    <>
      <SupplierOrderFilters orders={orders} status={status} supplier={supplier} onChange={select} />
      {statuses ? (
        <OrderStack orders={ordersWithStatus(atShop, statuses)} onFailure={showFailure} />
      ) : atShop.length > 0 ? (
        <GroupedOrders orders={atShop} onFailure={showFailure} />
      ) : (
        <Text color="gray.600">Nothing here.</Text>
      )}
      <StatusDialog open={noticeOpen} notice={notice} onClose={closeNotice} />
    </>
  );
}
