'use client';

import { Button, Stack, Text } from '@chakra-ui/react';
import type { CreateProductInput, DiscogsLookupResult } from '@vinyl-order/shared';
import { type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';

import DiscogsImport from '@/components/admin/discogs-import';
import ProductFormFields, { type ProductFormValues } from '@/components/admin/product-form-fields';
import { useUploadImage } from '@/services/queries/uploads/use-upload-image';

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
 * Shared add/edit product form. Owns the react-hook-form instance, the Discogs
 * prefill, and image upload; maps the UI-friendly ProductFormValues to the API
 * contract on submit. The page wires the actual create/update mutation via props.
 */
const ProductForm = ({ initialValues, submitLabel, submitting, errorMessage, onSubmit }: Props) => {
  const uploadMutation = useUploadImage();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({ defaultValues: initialValues });

  const imageUrl = watch('imageUrl');

  // Fill metadata fields from a chosen Discogs result; price/stock stay as set.
  const prefillFrom = (result: DiscogsLookupResult) => {
    setValue('discogsReleaseId', result.id);
    setValue('title', result.title);
    setValue('artist', result.artist);
    setValue('year', result.year);
    setValue('genresText', result.genres.join(', '));
    setValue('formatText', result.format.join(', '));
    setValue('imageUrl', result.coverImage);
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const { url } = await uploadMutation.mutateAsync(file);
    setValue('imageUrl', url);
  };

  const submit = handleSubmit((values) => {
    onSubmit(
      {
        discogsReleaseId: values.discogsReleaseId ?? undefined,
        title: values.title,
        artist: values.artist,
        year: values.year ?? undefined,
        genres: splitCsv(values.genresText),
        format: splitCsv(values.formatText),
        imageUrl: values.imageUrl ?? undefined,
        priceCents: Math.round(values.price * 100),
        currency: values.currency,
        stock: values.stock,
        isHot: values.isHot,
        isSlide: values.isSlide,
        slideOrder: values.slideOrder,
      },
      { reset: () => reset() },
    );
  });

  return (
    <>
      <DiscogsImport onPick={prefillFrom} />

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

          {errorMessage ? <Text color="red.500">{errorMessage}</Text> : null}

          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </>
  );
};

/** Empty form state for the create page. */
export const blankProductForm: ProductFormValues = {
  discogsReleaseId: null,
  title: '',
  artist: '',
  year: null,
  genresText: '',
  formatText: '',
  imageUrl: null,
  price: 0,
  currency: 'TWD',
  stock: 0,
  isHot: false,
  isSlide: false,
  slideOrder: 0,
};

export default ProductForm;
