'use client';

import { Container, Text } from '@chakra-ui/react';
import { redirect, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import PageShell from '@/components/layout/page-shell';
import Grid from '@/components/product/grid';
import GridSkeleton from '@/components/product/grid-skeleton';
import Paginator from '@/components/ui/paginator';
import SectionHeading from '@/components/ui/section-heading';
import { type PageTarget, pageCount, useCursorPages } from '@/hooks/useCursorPages';
import { useCategories } from '@/services/queries/categories/useCategories';
import { useProducts } from '@/services/queries/products/useProducts';

const PAGE_SIZE = 12;

/**
 * Public catalogue browse for one category.
 *
 * The slug drives the query rather than a category id, so the URL stays
 * readable and survives a tab being renamed — the whole reason categories carry
 * a slug separate from their display name.
 *
 * Paging is cursor-based (see useCursorPages): first, adjacent and last pages,
 * no jumping to an arbitrary page. Switching category starts again on page 1.
 *
 * @param slug - the category being browsed
 */
const Catalogue = ({ slug }: { slug: string }) => {
  const { data: categories } = useCategories();

  const pages = useCursorPages(PAGE_SIZE, slug);
  const { data, isPending, isError, isPlaceholderData } = useProducts(pages.args, slug);

  const products = data?.edges?.map((edge) => edge.node) ?? [];
  const active = categories?.find((category) => category.slug === slug);

  const turn = (target: PageTarget) => {
    if (!data) return;
    pages.go(target, data);
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

      {data && products.length > 0 ? (
        <Paginator
          page={pages.page}
          totalPages={pageCount(data.totalCount, PAGE_SIZE)}
          hasPrevious={data.pageInfo.hasPreviousPage}
          hasNext={data.pageInfo.hasNextPage}
          busy={isPlaceholderData}
          onChange={turn}
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
