'use client';

import { Button, Field, IconButton, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { isAllowedCoverUrl } from '@vinyl-order/shared';
import type { ReactNode } from 'react';
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  useFieldArray,
  useWatch,
} from 'react-hook-form';

import Cover from '@/components/ui/cover';
import { CloseIcon } from '@/components/ui/icons';

import { type SupplierOrderFormValues, blankLine } from '../values';

type LineErrors = NonNullable<FieldErrors<SupplierOrderFormValues>['items']>[number];

/** A labelled input with its error underneath, marked invalid when it has one. */
const LineField = ({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error: string | undefined;
  required?: boolean;
  children: ReactNode;
}) => (
  <Field.Root invalid={Boolean(error)} required={required} flex="1">
    <Field.Label>{label}</Field.Label>
    {children}
    <Field.ErrorText>{error}</Field.ErrorText>
  </Field.Root>
);

/**
 * The line's cover as typed, shown beside its title. Only an address the
 * API would accept is loaded, so a half-typed or foreign one shows the blank
 * tile rather than a broken image.
 */
const CoverPreview = ({
  control,
  index,
}: {
  control: Control<SupplierOrderFormValues>;
  index: number;
}) => {
  const imageUrl = useWatch({ control, name: `items.${index}.imageUrl` }).trim();
  return <Cover src={isAllowedCoverUrl(imageUrl) ? imageUrl : null} size="10" px={40} />;
};

/**
 * One record's fields: what it is, how many, at what price, when it's due,
 * and its cover.
 */
const Line = ({
  index,
  control,
  register,
  errors = {},
  onRemove,
}: {
  index: number;
  control: Control<SupplierOrderFormValues>;
  register: UseFormRegister<SupplierOrderFormValues>;
  errors: LineErrors | undefined;
  /** Absent for the only line, which can't be removed. */
  onRemove?: () => void;
}) => (
  <Stack gap="3" p="4" borderWidth="1px" borderColor="border.muted" borderRadius="card">
    <Stack direction="row" align="end" gap="2">
      <CoverPreview control={control} index={index} />
      <LineField label="Record" error={errors.title?.message} required>
        <Input placeholder="Artist – Title" {...register(`items.${index}.title`)} />
      </LineField>
      <IconButton
        aria-label={`Remove record ${index + 1}`}
        variant="ghost"
        onClick={onRemove}
        disabled={!onRemove}
      >
        <CloseIcon />
      </IconButton>
    </Stack>

    <SimpleGrid columns={{ base: 1, sm: 3 }} gap="3">
      <LineField label="Qty" error={errors.quantity?.message} required>
        <Input inputMode="numeric" {...register(`items.${index}.quantity`)} />
      </LineField>
      <LineField label="Price each (NT$)" error={errors.price?.message} required>
        <Input inputMode="numeric" {...register(`items.${index}.price`)} />
      </LineField>
      <LineField label="Expected (month)" error={errors.expectedMonth?.message}>
        <Input type="month" placeholder="YYYY-MM" {...register(`items.${index}.expectedMonth`)} />
      </LineField>
    </SimpleGrid>

    <Field.Root invalid={Boolean(errors.imageUrl)}>
      <Field.Label>Cover image</Field.Label>
      <Input
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder="https://…"
        {...register(`items.${index}.imageUrl`)}
      />
      <Field.HelperText>
        On the shop&apos;s product page, right-click the cover and copy its image address.
      </Field.HelperText>
      <Field.ErrorText>{errors.imageUrl?.message}</Field.ErrorText>
    </Field.Root>
  </Stack>
);

interface Props {
  control: Control<SupplierOrderFormValues>;
  register: UseFormRegister<SupplierOrderFormValues>;
  errors: FieldErrors<SupplierOrderFormValues>;
}

/**
 * The records in the order, one block per line: add as many as the order
 * has, remove any but the last — an order with nothing in it isn't one.
 *
 * Typed by hand for now; picking from tracked offers comes with the product
 * page (tracker.md §14 step 9).
 */
export default function SupplierOrderLines({ control, register, errors }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  return (
    <Stack gap="4">
      {fields.map((field, index) => (
        <Line
          key={field.id}
          index={index}
          control={control}
          register={register}
          errors={errors.items?.[index]}
          onRemove={fields.length > 1 ? () => remove(index) : undefined}
        />
      ))}

      {/* The array's own error ("at least one"), when it has one. */}
      {errors.items?.root?.message ? (
        <Text fontSize="sm" color="fg.error">
          {errors.items.root.message}
        </Text>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        borderRadius="full"
        alignSelf="start"
        onClick={() => append(blankLine)}
        disabled={fields.length >= 50}
      >
        + Add a record
      </Button>
    </Stack>
  );
}
