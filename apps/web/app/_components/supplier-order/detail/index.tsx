'use client';

import { Button, Skeleton, Stack } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import EmptyState from '@/components/ui/empty-state';
import StatusDialog, { type StatusNotice } from '@/components/ui/status-dialog';
import { HttpError } from '@/lib/core/http';
import { useMe } from '@/services/queries/auth/useMe';
import { useSupplierOrder } from '@/services/queries/supplier-orders/useSupplierOrder';

import OrderHeader from './_components/header';
import OrderInfo from './_components/info';
import OrderPayment from './_components/payment';
import OrderProgress from './_components/progress';
import OrderRecords from './_components/records';

const BackToList = () => (
  <Button asChild colorPalette="brand" borderRadius="full">
    <NextLink href="/supplier-orders">Back to supplier orders</NextLink>
  </Button>
);

const DetailSkeleton = () => (
  <Stack gap="5">
    <Skeleton h="24" borderRadius="card" />
    <Skeleton h="40" borderRadius="card" />
    <Skeleton h="40" borderRadius="card" />
  </Stack>
);

/**
 * One supplier order on its own page (tracker.md §9.2): everything the
 * list's card leaves out — every record, what the total is made of, the
 * payment, the tracking number and the note — and where it stands in its
 * shop's steps, with what to do next.
 *
 * @param id - the order, from the URL
 */
export default function SupplierOrderDetail({ id }: { id: string }) {
  const { data: user, isPending: authPending } = useMe();
  const { data: order, isPending, error } = useSupplierOrder(id);

  if (authPending) return <DetailSkeleton />;
  if (!user) {
    return (
      <EmptyState
        title="Sign in to see this order"
        body="Your supplier orders are kept with your account."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  if (isPending) return <DetailSkeleton />;
  if (!order) {
    // Not theirs reads the same as gone: the API answers 404 for both.
    const gone = error instanceof HttpError && error.status === 404;
    return (
      <EmptyState
        title={gone ? 'This order no longer exists' : "Couldn't load this order"}
        body={gone ? 'It may have been deleted.' : 'Please try again in a moment.'}
        cta={<BackToList />}
      />
    );
  }

  return <Order order={order} />;
}

/**
 * The order, loaded. Why an action failed is shown in a dialog here, as the
 * list does: a refused change refreshes the order underneath.
 */
const Order = ({ order }: { order: SupplierOrder }) => {
  const router = useRouter();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  // Stable: StatusDialog's auto-close effect depends on it.
  const closeNotice = useCallback(() => setNoticeOpen(false), []);
  const showFailure = (message: string) => {
    setNotice({ status: 'error', message });
    setNoticeOpen(true);
  };
  // Replaced, so Back doesn't return to a page that is gone.
  const leave = () => router.replace('/supplier-orders');

  return (
    <Stack gap="5">
      <OrderHeader order={order} onFailure={showFailure} onDeleted={leave} />
      {order.status !== 'cancelled' ? <OrderProgress order={order} /> : null}
      <OrderRecords order={order} />
      <OrderPayment order={order} onFailure={showFailure} />
      <OrderInfo order={order} />
      <Button asChild alignSelf="end" variant="outline" borderRadius="full">
        <NextLink href={`/supplier-orders/${order.id}/edit`}>Edit order</NextLink>
      </Button>
      <StatusDialog open={noticeOpen} notice={notice} onClose={closeNotice} />
    </Stack>
  );
};
