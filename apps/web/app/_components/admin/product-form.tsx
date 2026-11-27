'use client';

import { Button, Stack, Text } from '@chakra-ui/react';
import type { UpdateProductInput } from '@vinyl-order/shared';
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
  /** Values the form starts with: the product's. */
  initialValues: ProductFormValues;
  submitLabel: string;
  submitting: boolean;
  errorMessage: string | null;
  /** Receives the fully-built PATCH body: every field, the unchanged too. */
  onSubmit: (payload: UpdateProductInput) => void;
}
/**
 * The product edit form. Owns the react-hook-form instance and image upload;
 * maps the UI-friendly ProductFormValues to the API contract on submit. The
 * page wires the update mutation via props. Records are made from a shop's
 * listing, never here (tracker.md §8).
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
    onSubmit({
      title: values.title,
      releaseDate: values.releaseDate || null,
      edition: values.edition.trim() || null,
      format: splitCsv(values.formatText),
      imageUrl: values.imageUrl,
    });
  });

  return (
    <form onSubmit={submit}>
      <Stack gap="4">
        <ProductFormFields
          register={register}
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
