'use client';

import { Field, Input, Stack, Switch } from '@chakra-ui/react';
import { type Control, Controller } from 'react-hook-form';

import type { ProductFormValues } from '@/components/admin/product-form-fields';

/**
 * The merchandising half of the product form: where a product is surfaced on
 * the storefront, as opposed to what the record is.
 *
 * The carousel switch and the position box are two views of one field.
 * `slideOrder` is null when the record isn't in the carousel and an integer
 * when it is, so the switch is really "is this null?" — turning it off writes
 * null, turning it on gives it a position. There is no second flag that could
 * disagree with the number.
 */
const MerchandisingFields = ({ control }: { control: Control<ProductFormValues> }) => (
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
      name="slideOrder"
      render={({ field }) => {
        const inCarousel = field.value !== null;

        return (
          <Stack gap="4">
            <Switch.Root
              checked={inCarousel}
              onCheckedChange={(details) => field.onChange(details.checked ? 0 : null)}
            >
              <Switch.HiddenInput onBlur={field.onBlur} />
              <Switch.Control />
              <Switch.Label>Show in hero carousel</Switch.Label>
            </Switch.Root>

            <Field.Root maxW="xs" disabled={!inCarousel}>
              <Field.Label>Carousel position</Field.Label>
              <Input
                type="number"
                value={field.value ?? ''}
                onChange={(event) =>
                  field.onChange(event.target.value === '' ? null : Number(event.target.value))
                }
              />
              <Field.HelperText>
                Lower shows first; ties fall back to newest-first. Easiest to arrange on the Hero
                carousel screen.
              </Field.HelperText>
            </Field.Root>
          </Stack>
        );
      }}
    />
  </Stack>
);

export default MerchandisingFields;
