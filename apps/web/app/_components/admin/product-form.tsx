'use client';

import { Button, Stack, Text } from '@chakra-ui/react';
import type { CreateProductInput } from '@vinyl-order/shared';
import { type ChangeEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import ProductFormFields, { type ProductFormValues } from '@/components/admin/product-form-fields';
import { useUploadImage } from '@/services/queries/uploads/useUploadImage';

const splitCsv = (text: string): string[] =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

interface Props {
  /** Values the form starts with — blank for create, the product for edit. */
  initialValues: ProductFormValues;
  submitLabel: string;
  submitting: boolean;
  errorMessage: string | null;
  /**
   * Receives a fully-built payload plus a `reset` helper (clears the form back to
   * its initial values). The payload is CreateProductInput-shaped (all fields
   * present); the update flow sends the same body to PATCH (which ignores
   * unchanged fields), so one builder serves both create and edit. The create
   * page calls `reset` on success to add another; edit ignores it and redirects.
   */
  onSubmit: (payload: CreateProductInput, helpers: { reset: () => void }) => void;
}
/**
 * Shared add/edit product form. Owns the react-hook-form instance and image
 * upload; maps the UI-friendly ProductFormValues to the API
 * contract on submit. The page wires the actual create/update mutation via props.
 */
export default function ProductForm({
  initialValues,
  submitLabel,
  submitting,
  errorMessage,
  onSubmit,
}: Props) {
  const uploadMutation = useUploadImage();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({ defaultValues: initialValues });

  // useWatch rather than watch(): watch returns a function that can't be
  // memoized, which opts this component out of React Compiler optimisation.
  const imageUrl = useWatch({ control, name: 'imageUrl' });

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const { url } = await uploadMutation.mutateAsync(file);
    setValue('imageUrl', url);
  };

  const submit = handleSubmit((values) => {
    onSubmit(
      {
        title: values.title,
        artist: values.artist,
        year: values.year ?? undefined,
        format: splitCsv(values.formatText),
        imageUrl: values.imageUrl ?? undefined,
        priceCents: Math.round(values.price * 100),
        currency: values.currency,
        stock: values.stock,
        categoryIds: values.categoryIds,
      },
      { reset: () => reset() },
    );
  });

  return (
    <form onSubmit={submit}>
      <Stack gap="4">
        <ProductFormFields
          register={register}
          control={control}
          errors={errors}
          imageUrl={imageUrl}
          onFileChange={onFileChange}
          uploading={uploadMutation.isPending}
        />

        {errorMessage ? <Text color="fg.error">{errorMessage}</Text> : null}

        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  );
}

/** Empty form state for the create page. */
export const blankProductForm: ProductFormValues = {
  title: '',
  artist: '',
  year: null,
  formatText: '',
  imageUrl: null,
  price: 0,
  currency: 'TWD',
  stock: 0,
  categoryIds: [],
};
