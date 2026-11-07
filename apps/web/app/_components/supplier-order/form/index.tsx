'use client';

import {
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierSchema } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import Panel from '@/components/admin/panel';
import EmptyState from '@/components/ui/empty-state';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';
import { supplierOrderErrorCode } from '@/services/api/supplier-orders/errors';
import { useMe } from '@/services/queries/auth/useMe';
import { useCreateSupplierOrder } from '@/services/queries/supplier-orders/useCreateSupplierOrder';

import SupplierOrderLines from './_components/lines';
import {
  type SupplierOrderFormValues,
  blankSupplierOrderForm,
  supplierOrderFormSchema,
  toCreateInput,
} from './values';

/**
 * Record an order placed at one of the shops: which shop, its order number
 * and date, what it cost, and the records in it.
 *
 * The form validates its own string-shaped values (see values.ts) and turns
 * them into the API's body on submit. Saved, it goes back to the list, where
 * the new order is already in place.
 *
 * Submitting twice can't record two orders: the button is busy while saving,
 * and if a second request got through anyway, the API's per-user unique
 * order number would refuse it — shown here as a duplicate.
 */
export default function SupplierOrderForm() {
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

  return <Form />;
}

/** The form proper, mounted once there is someone to save it for. */
const Form = () => {
  const router = useRouter();
  const createMutation = useCreateSupplierOrder();
  // Computed once, so today's date doesn't move under the user mid-entry.
  const [defaultValues] = useState(blankSupplierOrderForm);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SupplierOrderFormValues>({
    resolver: zodResolver(supplierOrderFormSchema),
    defaultValues,
  });

  const submit = handleSubmit((values) => {
    createMutation.mutate(toCreateInput(values), {
      onSuccess: () => router.push('/supplier-orders'),
      onError: (error) => {
        // The one refusal that belongs to a field: say so where it was typed.
        if (supplierOrderErrorCode(error) === 'SUPPLIER_ORDER_DUPLICATE') {
          setError('orderNumber', {
            message: "You've already recorded this order number at this shop.",
          });
        }
      },
    });
  });

  const otherError =
    createMutation.error && supplierOrderErrorCode(createMutation.error) === undefined
      ? "Couldn't save the order. Please try again."
      : null;

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="5">
        <Panel title="Order" description="As the shop's confirmation shows it.">
          <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
            <Field.Root invalid={Boolean(errors.supplier)} required>
              <Field.Label>Shop</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field placeholder="Pick a shop" {...register('supplier')}>
                  {supplierSchema.options.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {SUPPLIER_LABEL[supplier]}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.ErrorText>{errors.supplier?.message}</Field.ErrorText>
            </Field.Root>

            <Field.Root invalid={Boolean(errors.orderNumber)} required>
              <Field.Label>Order number</Field.Label>
              <Input autoComplete="off" {...register('orderNumber')} />
              <Field.ErrorText>{errors.orderNumber?.message}</Field.ErrorText>
            </Field.Root>

            <Field.Root invalid={Boolean(errors.orderedAt)} required>
              <Field.Label>Ordered on</Field.Label>
              <Input type="date" {...register('orderedAt')} />
              <Field.ErrorText>{errors.orderedAt?.message}</Field.ErrorText>
            </Field.Root>

            <Field.Root invalid={Boolean(errors.total)}>
              <Field.Label>Total (NT$)</Field.Label>
              <Input inputMode="numeric" {...register('total')} />
              <Field.HelperText>What the shop charged, shipping included.</Field.HelperText>
              <Field.ErrorText>{errors.total?.message}</Field.ErrorText>
            </Field.Root>

            <Field.Root invalid={Boolean(errors.trackingNumber)}>
              <Field.Label>Tracking number</Field.Label>
              <Input autoComplete="off" {...register('trackingNumber')} />
              <Field.ErrorText>{errors.trackingNumber?.message}</Field.ErrorText>
            </Field.Root>
          </SimpleGrid>

          <Field.Root invalid={Boolean(errors.note)}>
            <Field.Label>Note</Field.Label>
            <Textarea rows={2} {...register('note')} />
            <Field.ErrorText>{errors.note?.message}</Field.ErrorText>
          </Field.Root>
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
            loading={createMutation.isPending}
          >
            Save order
          </Button>
        </HStack>
      </Stack>
    </form>
  );
};
