'use client';

import { Field, Image, Input, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import type { ChangeEvent } from 'react';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';

import CategoryFields from '@/components/admin/category-fields';
import Panel from '@/components/ui/panel';

/**
 * Product form state. Lists and blanks are edited as UI-friendly shapes
 * (format as comma-separated text, an empty date or edition as '') and
 * mapped to UpdateProductInput on submit — the API owns the real contract
 * (string[], null). Shared with the page that orchestrates the form.
 *
 * What was read from a shop's listing, to correct, and the categories to
 * file it under. No price, stock or artist: a price belongs to a shop's
 * offer, and an artist is edited as an artist (tracker.md §8).
 */
export interface ProductFormValues {
  title: string;
  /** `YYYY-MM-DD`, or '' when unknown. */
  releaseDate: string;
  edition: string;
  formatText: string;
  imageUrl: string | null;
  categoryIds: string[];
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
export default function ProductFormFields({
  register,
  control,
  errors,
  imageUrl,
  onFileChange,
  uploading,
}: Props) {
  return (
    <Stack gap="5">
      <Panel title="Release" description="What the record is.">
        <Field.Root invalid={Boolean(errors.title)} required>
          <Field.Label>Title</Field.Label>
          <Input {...register('title', { required: 'Title is required' })} />
          <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
        </Field.Root>

        <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
          <Field.Root>
            <Field.Label>Release date</Field.Label>
            <Input type="date" {...register('releaseDate')} />
          </Field.Root>
          <Field.Root>
            <Field.Label>Edition</Field.Label>
            <Input {...register('edition')} placeholder="日版, 限量彩膠" />
          </Field.Root>
          <Field.Root>
            <Field.Label>Format (comma-separated)</Field.Label>
            <Input {...register('formatText')} placeholder="LP, 2LP" />
          </Field.Root>
        </SimpleGrid>
      </Panel>

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

      <Panel title="Categories">
        <CategoryFields control={control} />
      </Panel>
    </Stack>
  );
}
