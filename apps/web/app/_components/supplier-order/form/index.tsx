'use client';

import { Alert, Button, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import type { SupplierOrder } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import Panel from '@/components/admin/panel';
import EmptyState from '@/components/ui/empty-state';
import { HttpError } from '@/lib/core/http';
import { supplierOrderErrorCode } from '@/services/api/supplier-orders/errors';
import { useMe } from '@/services/queries/auth/useMe';
import { useCreateSupplierOrder } from '@/services/queries/supplier-orders/useCreateSupplierOrder';
import { useSupplierOrder } from '@/services/queries/supplier-orders/useSupplierOrder';
import { useUpdateSupplierOrder } from '@/services/queries/supplier-orders/useUpdateSupplierOrder';

import SupplierOrderLines from './_components/lines';
import SupplierOrderFields from './_components/order-fields';
import {
  type SupplierOrderFormValues,
  blankSupplierOrderForm,
  supplierOrderFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
} from './values';

const BackToList = () => (
  <Button asChild colorPalette="brand" borderRadius="full">
    <NextLink href="/supplier-orders">Back to supplier orders</NextLink>
  </Button>
);

/**
 * Record an order placed at one of the shops — which shop, its order number
 * and date, what it cost, and the records in it — or, given an `id`, edit one
 * already recorded.
 *
 * The form validates its own string-shaped values (see values.ts) and turns
 * them into the API's body on submit. Saved, it goes back to the list, where
 * the order is already up to date.
 *
 * Submitting twice can't record two orders: the button is busy while saving,
 * and if a second request got through anyway, the API's per-user unique
 * order number would refuse it — shown here as a duplicate.
 *
 * @param id - the order to edit; absent to record a new one
 */
export default function SupplierOrderForm({ id }: { id?: string }) {
  const { data: user, isPending: authPending } = useMe();

  if (authPending) return <Skeleton h="96" borderRadius="card" />;
  // Opened by URL while signed out: saving would only 401, so ask first.
  if (!user) {
    return (
      <EmptyState
        title="Sign in to record an order"
        body="Your supplier orders are kept with your account."
        cta={
          <Button asChild colorPalette="brand" borderRadius="full">
            <NextLink href="/login">Sign in</NextLink>
          </Button>
        }
      />
    );
  }

  return id ? <LoadOrder id={id} /> : <Form />;
}

/** Load the order to edit, then show the form filled in with it. */
const LoadOrder = ({ id }: { id: string }) => {
  const { data: order, isPending, error, refetch } = useSupplierOrder(id);

  if (isPending) return <Skeleton h="96" borderRadius="card" />;
  if (!order) {
    const gone = error instanceof HttpError && error.status === 404;
    return (
      <EmptyState
        title={gone ? 'This order no longer exists' : "Couldn't load this order"}
        body={gone ? 'It may have been deleted in another tab.' : 'Please try again in a moment.'}
        cta={<BackToList />}
      />
    );
  }

  // Only a successful refetch counts: on failure React Query keeps the old
  // copy, and refilling the form from it would just be stale again.
  const reload = async () => {
    const result = await refetch();
    return result.isSuccess ? result.data : undefined;
  };

  return <Form order={order} reload={reload} />;
};

/**
 * Shown when a save is refused because the order changed after the form was
 * filled in (409 SUPPLIER_ORDER_STALE). Nothing is replaced until the user
 * asks: what they typed stays on screen until then, so it can be copied.
 */
const StaleNotice = ({ onReload, reloading }: { onReload: () => void; reloading: boolean }) => (
  <Alert.Root status="warning" borderRadius="card">
    <Alert.Indicator />
    <Stack flex="1" gap="3">
      <Alert.Content>
        <Alert.Title>This order was changed somewhere else</Alert.Title>
        <Alert.Description>
          It was edited in another tab or window after you opened it, so your changes weren&apos;t
          saved. Reload to see the latest version — what you typed here will be replaced.
        </Alert.Description>
      </Alert.Content>
      <Button
        alignSelf="start"
        size="sm"
        variant="outline"
        borderRadius="full"
        loading={reloading}
        onClick={onReload}
      >
        Reload
      </Button>
    </Stack>
  </Alert.Root>
);

/** Why a save failed, when it isn't one of the cases shown on their own. */
const saveErrorMessage = (error: unknown): string | null => {
  if (!error) return null;
  if (error instanceof HttpError && error.status === 404) return 'This order no longer exists.';
  // A duplicate is shown on its field; a stale save, by StaleNotice.
  if (supplierOrderErrorCode(error)) return null;
  return "Couldn't save the order. Please try again.";
};

/**
 * The form proper, mounted once there is someone to save it for.
 *
 * @param order - the order to edit, as loaded; absent for a new one
 * @param reload - fetch the order again, for a stale save
 */
const Form = ({
  order,
  reload,
}: {
  order?: SupplierOrder;
  reload?: () => Promise<SupplierOrder | undefined>;
}) => {
  const router = useRouter();
  const createMutation = useCreateSupplierOrder();
  const updateMutation = useUpdateSupplierOrder();
  const mutation = order ? updateMutation : createMutation;
  // The copy the form was filled from, and so the version a save is checked
  // against. Held here rather than read from `order` on submit: a background
  // refetch can hand down a newer copy without the fields changing, and
  // sending that version would let this edit overwrite the newer one.
  const [base, setBase] = useState(order);
  const [reloading, setReloading] = useState(false);
  // Computed once, so today's date doesn't move under the user mid-entry.
  const [defaultValues] = useState(() => (order ? toFormValues(order) : blankSupplierOrderForm()));

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<SupplierOrderFormValues>({
    resolver: zodResolver(supplierOrderFormSchema),
    defaultValues,
  });

  const submit = handleSubmit((values) => {
    const callbacks = {
      onSuccess: () => router.push('/supplier-orders'),
      onError: (error: unknown) => {
        // The one refusal that belongs to a field: say so where it was typed.
        if (supplierOrderErrorCode(error) === 'SUPPLIER_ORDER_DUPLICATE') {
          setError('orderNumber', {
            message: "You've already recorded this order number at this shop.",
          });
        }
      },
    };
    if (base) {
      updateMutation.mutate(
        { id: base.id, input: toUpdateInput(values, base.updatedAt) },
        callbacks,
      );
    } else {
      createMutation.mutate(toCreateInput(values), callbacks);
    }
  });

  const reloadLatest = async () => {
    setReloading(true);
    const latest = await reload?.();
    setReloading(false);
    if (!latest) return;
    setBase(latest);
    reset(toFormValues(latest));
    updateMutation.reset();
  };

  const stale = supplierOrderErrorCode(mutation.error) === 'SUPPLIER_ORDER_STALE';
  const otherError = saveErrorMessage(mutation.error);

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="5">
        {stale ? <StaleNotice onReload={reloadLatest} reloading={reloading} /> : null}

        <Panel title="Order" description="As the shop's confirmation shows it.">
          <SupplierOrderFields register={register} errors={errors} fixedSupplier={base?.supplier} />
        </Panel>

        <Panel title="Records" description="What's in the order, and when each is due.">
          <SupplierOrderLines control={control} register={register} errors={errors} />
        </Panel>

        {otherError ? <Text color="fg.error">{otherError}</Text> : null}

        <HStack justify="end" gap="3">
          <Button asChild variant="ghost" borderRadius="full">
            <NextLink href="/supplier-orders">Cancel</NextLink>
          </Button>
          <Button
            type="submit"
            colorPalette="brand"
            borderRadius="full"
            loading={mutation.isPending}
          >
            {base ? 'Save changes' : 'Save order'}
          </Button>
        </HStack>
      </Stack>
    </form>
  );
};
