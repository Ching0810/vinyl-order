'use client';

import { Field, Input, NativeSelect, SimpleGrid, Textarea } from '@chakra-ui/react';
import { type Supplier, supplierSchema } from '@vinyl-order/shared';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';

import type { SupplierOrderFormValues } from '../values';

interface Props {
  register: UseFormRegister<SupplierOrderFormValues>;
  errors: FieldErrors<SupplierOrderFormValues>;
  /**
   * The shop of an order being edited, shown but not editable: an order
   * placed at one shop is never another's. Absent for a new order.
   */
  fixedSupplier?: Supplier;
}

/** The order's own fields: shop, number, date, total, payment day, tracking and note. */
export default function SupplierOrderFields({ register, errors, fixedSupplier }: Props) {
  return (
    <>
      <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
        {fixedSupplier ? (
          <Field.Root readOnly>
            <Field.Label>Shop</Field.Label>
            <Input value={SUPPLIER_LABEL[fixedSupplier]} readOnly />
            <Field.HelperText>The shop an order was placed at can&apos;t change.</Field.HelperText>
          </Field.Root>
        ) : (
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
        )}

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

        <Field.Root invalid={Boolean(errors.paidAt)}>
          <Field.Label>Paid on</Field.Label>
          <Input type="date" {...register('paidAt')} />
          <Field.HelperText>Leave blank if not paid yet, e.g. cash on pickup.</Field.HelperText>
          <Field.ErrorText>{errors.paidAt?.message}</Field.ErrorText>
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
    </>
  );
}
