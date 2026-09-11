'use client';

import { Skeleton, Stack, Text } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import type { Category } from '@vinyl-order/shared';

import Panel from '@/components/admin/panel';
import { categoriesQueryKey, useCategories } from '@/services/queries/categories/use-categories';
import {
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/services/queries/categories/use-category-mutations';

import AddCategory from './_components/add-category';
import CategoryRow from './_components/category-row';

/**
 * Manage the storefront tab bar: which tabs exist, what they are called, and
 * the order they appear in.
 *
 * This screen is what makes curated categories worth their extra table — a tab
 * can be added or reordered as data, without a deploy.
 *
 * Reordering writes the whole list back as 0..n-1 and only PATCHes rows whose
 * position actually changed. Unlike the carousel, the API has no insertion-index
 * behaviour for categories, so the client owns the renumbering here. Optimistic
 * state goes into the query cache rather than a local mirror, for the same
 * reason as the hero screen: a mutation settles before the query it invalidated
 * refetches, and a mirror synced in that gap flashes stale rows back.
 */
const CategoryManager = () => {
  const queryClient = useQueryClient();
  const { data, isPending } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const categories = data ?? [];
  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const showOptimistically = (next: Category[]) =>
    queryClient.setQueryData(categoriesQueryKey, next);

  const move = (from: number, to: number) => {
    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    showOptimistically(
      next.map((category, i) => {
        return { ...category, sortOrder: i };
      }),
    );

    next.forEach((category, i) => {
      if (category.sortOrder !== i) {
        updateMutation.mutate({ id: category.id, input: { sortOrder: i } });
      }
    });
  };

  return (
    <Stack gap="5">
      <Panel
        title="Tabs"
        description="Top to bottom is the order they appear in the storefront header."
      >
        {isPending ? (
          <Stack gap="2">
            <Skeleton h="14" borderRadius="card" />
            <Skeleton h="14" borderRadius="card" />
          </Stack>
        ) : categories.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">
            No categories yet. The storefront hides the tab bar entirely until you add one.
          </Text>
        ) : (
          <Stack gap="2">
            {categories.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
                busy={busy}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
                onSave={(values) => updateMutation.mutate({ id: category.id, input: values })}
                onDelete={() => deleteMutation.mutate(category.id)}
              />
            ))}
          </Stack>
        )}
      </Panel>

      <Panel
        title="Add a tab"
        description="New tabs go to the end; reorder them above once created."
      >
        <AddCategory
          busy={busy}
          onCreate={(values) => createMutation.mutate({ ...values, sortOrder: categories.length })}
        />
      </Panel>
    </Stack>
  );
};

export default CategoryManager;
