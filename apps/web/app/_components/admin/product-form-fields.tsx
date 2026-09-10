'use client';

import { Field, Image, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import type { ChangeEvent } from 'react';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';

import MerchandisingFields from '@/components/admin/merchandising-fields';
import Panel from '@/components/admin/panel';

/**
 * Product form state. Numbers/lists are edited as UI-friendly shapes (price in
 * major units, genres/format as comma-separated text) and mapped to
 * CreateProductInput on submit — the API owns the real contract (priceCents,
 * string[]). Shared with the page that orchestrates the form.
 */
export interface ProductFormValues {
  discogsReleaseId: number | null;
  title: string;
  artist: string;
  year: number | null;
  genresText: string;
  formatText: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  stock: number;
  isHot: boolean;
  slideOrder: number | null;
}

interface Props {
  register: UseFormRegister<ProductFormValues>;
  control: Control<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  imageUrl: string | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
}

/** Presentational form fields — register/control/errors are wired by the parent form. */
const ProductFormFields = ({
  register,
  control,
  errors,
  imageUrl,
  onFileChange,
  uploading,
}: Props) => (
  <Stack gap="5">
    <Panel title="Release" description="What the record is. Usually filled in by a Discogs import.">
      <Field.Root invalid={Boolean(errors.title)} required>
        <Field.Label>Title</Field.Label>
        <Input {...register('title', { required: 'Title is required' })} />
        <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
      </Field.Root>

      <Field.Root invalid={Boolean(errors.artist)} required>
        <Field.Label>Artist</Field.Label>
        <Input {...register('artist', { required: 'Artist is required' })} />
        <Field.ErrorText>{errors.artist?.message}</Field.ErrorText>
      </Field.Root>

      <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
        <Field.Root>
          <Field.Label>Year</Field.Label>
          <Input
            type="number"
            {...register('year', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Genres (comma-separated)</Field.Label>
          <Input {...register('genresText')} />
        </Field.Root>
      </SimpleGrid>

      <Field.Root>
        <Field.Label>Format (comma-separated)</Field.Label>
        <Input {...register('formatText')} placeholder="Vinyl, LP, Album" />
      </Field.Root>
    </Panel>

    <Panel title="Pricing & stock" description="Owned by the shop — never imported.">
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap="4">
        <Field.Root invalid={Boolean(errors.price)} required>
          <Field.Label>Price</Field.Label>
          <Input
            type="number"
            step="1"
            {...register('price', {
              setValueAs: (v) => (v === '' ? NaN : Number(v)),
              validate: (v) => (Number.isFinite(v) && v >= 0) || 'Enter a valid price',
            })}
          />
          <Field.ErrorText>{errors.price?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root>
          <Field.Label>Currency</Field.Label>
          <Input {...register('currency', { required: true })} />
        </Field.Root>
        <Field.Root>
          <Field.Label>Stock</Field.Label>
          <Input
            type="number"
            {...register('stock', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })}
          />
        </Field.Root>
      </SimpleGrid>
    </Panel>

    {/* Cover image: from a Discogs prefill or an upload. */}
    <Panel title="Cover image">
      <Field.Root>
        <Stack gap="3">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="Cover preview"
              boxSize="32"
              objectFit="cover"
              borderRadius="md"
            />
          ) : (
            <Text fontSize="sm" color="fg.muted">
              No image yet.
            </Text>
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            p="1"
            onChange={onFileChange}
            disabled={uploading}
          />
          {uploading ? (
            <Text fontSize="sm" color="fg.muted">
              Uploading…
            </Text>
          ) : null}
        </Stack>
      </Field.Root>
    </Panel>

    <Panel title="Merchandising" description="Where this record shows up on the storefront.">
      <MerchandisingFields control={control} />
    </Panel>
  </Stack>
);

export default ProductFormFields;
