'use client';

import { Container, Text } from '@chakra-ui/react';
import type { PageArgs } from '@vinyl-order/shared';
import { redirect, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import PageShell from '@/components/layout/page-shell';
import Grid from '@/components/product/grid';
import GridSkeleton from '@/components/product/grid-skeleton';
import Paginator from '@/components/ui/paginator';
import SectionHeading from '@/components/ui/section-heading';
import { useCategories } from '@/services/queries/categories/use-categories';
import { useProducts } from '@/services/queries/products/use-products';

const PAGE_SIZE = 12;

/**
 * Public catalogue browse for one category.
 *
 * The slug drives the query rather than a category id, so the URL stays
 * readable and survives a tab being renamed — the whole reason categories carry
 * a slug separate from their display name.
 *
 * Paging is cursor-based, so there is no page-number jumping by design;
 * `pageNum` is display-only, to tell the visitor roughly where they are.
 *
 * @param slug - the category being browsed
 */
const Catalogue = ({ slug }: { slug: string }) => {
  const { data: categories } = useCategories();

  const [args, setArgs] = useState<PageArgs>({ first: PAGE_SIZE });
  const [pageNum, setPageNum] = useState(1);

  // Cursors belong to the list they came from. Switching tabs has to rewind to
  // the first page, or the next request pages from a cursor into a different
  // result set.
  useEffect(() => {
    setArgs({ first: PAGE_SIZE });
    setPageNum(1);
  }, [slug]);

  const { data, isPending, isError, isPlaceholderData } = useProducts(args, slug);

  const products = data?.edges?.map((edge) => edge.node) ?? [];
  const pageInfo = data?.pageInfo;
  const active = categories?.find((category) => category.slug === slug);

  const turn = (next: PageArgs, step: number) => {
    setArgs(next);
    setPageNum((n) => Math.max(1, n + step));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderBody = () => {
    if (isPending) return <GridSkeleton count={PAGE_SIZE} />;
    if (isError) {
      return <Text color="fg.error">Couldn&apos;t load the catalogue. Please retry.</Text>;
    }
    if (products.length === 0) {
      return <Text color="fg.muted">Nothing filed under this category yet.</Text>;
    }
    return <Grid products={products} />;
  };

  return (
    <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
      <SectionHeading eyebrow="Category" title={active?.name ?? 'The Catalogue'} />

      {renderBody()}

      {products.length > 0 ? (
        <Paginator
          pageNum={pageNum}
          hasPrevious={Boolean(pageInfo?.hasPreviousPage)}
          hasNext={Boolean(pageInfo?.hasNextPage)}
          busy={isPlaceholderData}
          onPrevious={() =>
            turn({ last: PAGE_SIZE, before: pageInfo?.startCursor ?? undefined }, -1)
          }
          onNext={() => turn({ first: PAGE_SIZE, after: pageInfo?.endCursor ?? undefined }, 1)}
        />
      ) : null}
    </Container>
  );
};

/**
 * Reads the category from `?category=`.
 *
 * There is no unfiltered "all records" listing — the header's category tabs are
 * the way in — so a bare `/products` (an old link, a trimmed URL) is sent home.
 * Checking here, before Catalogue mounts, means that visit never fires a
 * product query it would throw away.
 */
const CategoryGate = () => {
  const slug = useSearchParams().get('category');
  if (!slug) redirect('/');
  return <Catalogue slug={slug} />;
};
/** `useSearchParams` needs a Suspense boundary above it, so it lives here. */
export default function ProductsPage() {
  return (
    <PageShell>
      <Suspense fallback={<GridSkeleton count={PAGE_SIZE} />}>
        <CategoryGate />
      </Suspense>
    </PageShell>
  );
}
