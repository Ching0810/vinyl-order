'use client';

import { Container, Text } from '@chakra-ui/react';

import Hero from '@/components/home/hero';
import PageShell from '@/components/layout/page-shell';
import Grid from '@/components/product/grid';
import GridSkeleton from '@/components/product/grid-skeleton';
import Search from '@/components/product/search';
import SectionHeading from '@/components/ui/section-heading';
import { useProducts } from '@/services/queries/products/useProducts';

/** Records in the latest strip: one or two grid rows, never a catalogue. */
const LATEST_COUNT = 6;

/**
 * Public storefront home: the hero, then the newest records.
 *
 * A stopgap until the dashboard (docs/design/tracker.md §12.2) replaces it.
 * The latest strip is the first page of the catalogue, which is already
 * newest first, so it needs no endpoint of its own.
 */
export default function HomePage() {
  const { data, isPending, isError } = useProducts({ first: LATEST_COUNT });
  const latest = data?.edges.map((edge) => edge.node) ?? [];

  const renderLatest = () => {
    if (isPending) return <GridSkeleton count={LATEST_COUNT} />;
    if (isError) return <Text color="fg.error">Couldn&apos;t load products. Please retry.</Text>;
    if (latest.length === 0) return <Text color="fg.muted">No records yet.</Text>;
    return <Grid products={latest} />;
  };

  return (
    <PageShell>
      <Hero search={<Search />} />

      <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '12', md: '20' }}>
        <SectionHeading eyebrow="Just in" title="Latest Arrivals" />
        {renderLatest()}
      </Container>
    </PageShell>
  );
}
