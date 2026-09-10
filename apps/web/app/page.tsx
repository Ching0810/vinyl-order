'use client';

import { Button, Container, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import Hero from '@/components/home/hero';
import PageShell from '@/components/layout/page-shell';
import Grid from '@/components/product/grid';
import GridSkeleton from '@/components/product/grid-skeleton';
import Search from '@/components/product/search';
import SectionHeading from '@/components/ui/section-heading';
import { useHotProducts } from '@/services/queries/products/use-hot-products';
import { useSlideProducts } from '@/services/queries/products/use-slide-products';

/**
 * Public storefront home. A Client Component: the carousel and the hot grid are
 * both fetched through React Query, so the data lands in the shared cache and a
 * mutation elsewhere can invalidate it.
 *
 * The trade-off versus fetching in a Server Component is that this content is
 * no longer in the initial HTML — it renders as skeletons and fills in after
 * hydration. Both queries are issued on mount and resolve in parallel.
 *
 * Layout follows a stacked, modular structure — hero, then titled sections —
 * so new sections can be appended without reworking the page.
 */
const HomePage = () => {
  const { data: slideProducts, isPending: slidesPending } = useSlideProducts();
  const { data: hotProducts, isPending: hotPending, isError: hotFailed } = useHotProducts();

  const renderHot = () => {
    if (hotPending) return <GridSkeleton />;
    if (hotFailed) return <Text color="fg.error">Couldn&apos;t load products. Please retry.</Text>;
    if (!hotProducts || hotProducts.length === 0) {
      return <Text color="fg.muted">No hot products yet.</Text>;
    }
    return <Grid products={hotProducts} />;
  };

  return (
    <PageShell>
      <Hero slides={slideProducts ?? []} loading={slidesPending} search={<Search />} />

      <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '12', md: '20' }}>
        <SectionHeading
          eyebrow="Moving this week"
          title="Hot Right Now"
          action={
            <Button asChild variant="outline" size="sm" borderRadius="full">
              <NextLink href="/products">Browse all records</NextLink>
            </Button>
          }
        />
        {renderHot()}
      </Container>
    </PageShell>
  );
};

export default HomePage;
