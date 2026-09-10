'use client';

import { Skeleton, Stack, Text } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '@vinyl-order/shared';

import Panel from '@/components/admin/panel';
import { productsQueryKey } from '@/services/queries/products/use-products';
import {
  slideProductsQueryKey,
  useSlideProducts,
} from '@/services/queries/products/use-slide-products';
import { useUpdateProduct } from '@/services/queries/products/use-update-product';

import AddSlide from './_components/add-slide';
import SlideRow from './_components/slide-row';

/**
 * Manage which records appear in the hero carousel, and in what order.
 *
 * `slideOrder` is editable on each product's own form, but arranging a sequence
 * that way means opening every record and guessing numbers. This is the view
 * that treats the carousel as the ordered list it actually is.
 *
 * Each action is a single write. The API treats `slideOrder` as an insertion
 * index — closing the gap at the old slot and opening one at the target inside
 * a transaction — so the sequence stays contiguous and duplicate-free without
 * the client renumbering anything.
 *
 * The optimistic update is written straight into the query cache rather than
 * into a local copy of the list. A local mirror means two sources of truth, and
 * reconciling them is genuinely awkward: a mutation reports itself finished
 * before the query it invalidated has refetched, so for one render the cache
 * still holds pre-write data. Anything syncing the mirror in that window puts a
 * removed row back on screen until the refetch lands — it disappears, returns,
 * then disappears again. Writing into the cache leaves one source of truth, and
 * React Query keeps serving the optimistic value throughout the background
 * refetch, so there is no window to flash in.
 */
const HeroManager = () => {
  const queryClient = useQueryClient();
  const { data, isPending } = useSlideProducts();
  const updateMutation = useUpdateProduct();

  const order = data ?? [];
  const busy = updateMutation.isPending;

  const showOptimistically = (next: Product[]) =>
    queryClient.setQueryData(slideProductsQueryKey, next);

  /** On failure the optimistic list is a lie — refetch to get back to truth. */
  const resyncOnError = () => {
    void queryClient.invalidateQueries({ queryKey: productsQueryKey });
  };

  const move = (from: number, to: number) => {
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    showOptimistically(next);
    updateMutation.mutate({ id: moved.id, input: { slideOrder: to } }, { onError: resyncOnError });
  };

  const remove = (product: Product) => {
    showOptimistically(order.filter((entry) => entry.id !== product.id));
    // Null is the whole removal, and the API closes the gap behind it.
    updateMutation.mutate(
      { id: product.id, input: { slideOrder: null } },
      { onError: resyncOnError },
    );
  };

  const add = (product: Product) => {
    const position = order.length;
    showOptimistically([...order, { ...product, slideOrder: position }]);
    updateMutation.mutate(
      { id: product.id, input: { slideOrder: position } },
      { onError: resyncOnError },
    );
  };

  return (
    <Stack gap="5">
      <Panel
        title="Running order"
        description="Top to bottom is the order visitors see. The first slide loads eagerly, so put your strongest record there."
      >
        {isPending ? (
          <Stack gap="2">
            <Skeleton h="16" borderRadius="card" />
            <Skeleton h="16" borderRadius="card" />
          </Stack>
        ) : order.length === 0 ? (
          <Text fontSize="sm" color="fg.muted">
            Nothing in the carousel. The storefront falls back to a static panel until you add a
            record below.
          </Text>
        ) : (
          <Stack gap="2">
            {order.map((product, index) => (
              <SlideRow
                key={product.id}
                product={product}
                position={index}
                isFirst={index === 0}
                isLast={index === order.length - 1}
                busy={busy}
                onMoveUp={() => move(index, index - 1)}
                onMoveDown={() => move(index, index + 1)}
                onRemove={() => remove(product)}
              />
            ))}
          </Stack>
        )}
      </Panel>

      <Panel title="Add a record" description="Search the catalogue. Added records go to the end.">
        <AddSlide onAdd={add} busy={busy} inOrderIds={new Set(order.map((p) => p.id))} />
      </Panel>
    </Stack>
  );
};

export default HeroManager;
