'use client';

import { Box } from '@chakra-ui/react';

import Grid from '@/components/product/grid';
import GridSkeleton from '@/components/product/grid-skeleton';
import SectionHeading from '@/components/ui/section-heading';
import { useProductSearch } from '@/services/queries/products/useProductSearch';

/** How many other releases to show. */
const MAX_RELATED = 4;
/**
 * Other releases by the same artist.
 *
 * Reuses the catalogue search rather than adding an endpoint — searching the
 * artist name is exactly the query, and the result is already cached if the
 * visitor searched for them on the way in. The section hides itself entirely
 * when the artist has nothing else in the catalogue, which is the common case
 * for a small shop.
 *
 * @param artist - artist whose other releases to show
 * @param excludeId - the product currently being viewed
 */
export default function Related({ artist, excludeId }: { artist: string; excludeId: string }) {
  const { data, isPending } = useProductSearch(artist);

  const others = (data ?? []).filter((product) => product.id !== excludeId).slice(0, MAX_RELATED);

  if (!isPending && others.length === 0) return null;

  return (
    <Box mt={{ base: '14', md: '20' }}>
      <SectionHeading eyebrow="Same artist" title={`More from ${artist}`} />
      {isPending ? <GridSkeleton count={MAX_RELATED} /> : <Grid products={others} />}
    </Box>
  );
}
