'use client';

import { Field, Input, Stack, Switch } from '@chakra-ui/react';
import { type Control, Controller, type UseFormRegister } from 'react-hook-form';

import type { ProductFormValues } from '@/components/admin/product-form-fields';

/**
 * The merchandising half of the product form: where a product is surfaced on
 * the storefront, as opposed to what the record is.
 *
 * Switch is a controlled Chakra composite, so the booleans go through
 * Controller rather than `register`.
 */
const MerchandisingFields = ({
  control,
  register,
}: {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
}) => (
  <Stack gap="4">
    <Controller
      control={control}
      name="isHot"
      render={({ field }) => (
        <Switch.Root
          checked={field.value}
          onCheckedChange={(details) => field.onChange(details.checked)}
        >
          <Switch.HiddenInput onBlur={field.onBlur} />
          <Switch.Control />
          <Switch.Label>Hot product (feature on the home page)</Switch.Label>
        </Switch.Root>
      )}
    />

    <Controller
      control={control}
      name="isSlide"
      render={({ field }) => (
        <Switch.Root
          checked={field.value}
          onCheckedChange={(details) => field.onChange(details.checked)}
        >
          <Switch.HiddenInput onBlur={field.onBlur} />
          <Switch.Control />
          <Switch.Label>Show in hero carousel</Switch.Label>
        </Switch.Root>
      )}
    />

    <Field.Root maxW="xs">
      <Field.Label>Carousel position</Field.Label>
      <Input
        type="number"
        {...register('slideOrder', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
      />
      <Field.HelperText>
        Lower shows first. Products sharing a number fall back to newest-first. Kept when the
        carousel switch is off, so re-enabling restores this slot.
      </Field.HelperText>
    </Field.Root>
  </Stack>
);

export default MerchandisingFields;
