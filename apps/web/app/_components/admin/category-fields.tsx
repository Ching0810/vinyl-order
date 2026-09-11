'use client';

import { Checkbox, Field, Skeleton, Text, Wrap } from '@chakra-ui/react';
import { type Control, Controller } from 'react-hook-form';

import type { ProductFormValues } from '@/components/admin/product-form-fields';
import { useCategories } from '@/services/queries/categories/use-categories';

/**
 * Which storefront tabs this record appears under.
 *
 * Deliberately separate from the Genres text field above it. Genres are
 * descriptive metadata imported from Discogs; categories are curated
 * navigation, and Discogs has no opinion on whether a record belongs under
 * 華語. A record can sit in several — a Japanese jazz release belongs in both
 * 東洋 and 爵士 — which is why this is a checkbox group rather than a select.
 */
const CategoryFields = ({ control }: { control: Control<ProductFormValues> }) => {
  const { data: categories, isPending } = useCategories();

  if (isPending) return <Skeleton h="8" />;

  if (!categories || categories.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No categories defined yet.
      </Text>
    );
  }

  return (
    <Controller
      control={control}
      name="categoryIds"
      render={({ field }) => (
        <Field.Root>
          <Field.Label>Storefront categories</Field.Label>
          <Checkbox.Group value={field.value} onValueChange={field.onChange}>
            <Wrap gap="4" pt="1">
              {categories.map((category) => (
                <Checkbox.Root key={category.id} value={category.id}>
                  <Checkbox.HiddenInput onBlur={field.onBlur} />
                  <Checkbox.Control />
                  <Checkbox.Label>{category.name}</Checkbox.Label>
                </Checkbox.Root>
              ))}
            </Wrap>
          </Checkbox.Group>
          <Field.HelperText>
            Tabs this record shows under. Leaving all unchecked hides it from the tab bar — it stays
            reachable by search and by direct link.
          </Field.HelperText>
        </Field.Root>
      )}
    />
  );
};

export default CategoryFields;
