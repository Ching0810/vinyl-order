'use client';

import { Button, Container, HStack, Text } from '@chakra-ui/react';
import type { PageArgs } from '@vinyl-order/shared';
import { useState } from 'react';

import PageShell from '@/components/layout/page-shell';
import Grid from '@/components/product/grid';
import GridSkeleton from '@/components/product/grid-skeleton';
import SectionHeading from '@/components/ui/section-heading';
import { useProducts } from '@/services/queries/products/use-products';

const PAGE_SIZE = 12;

/**
 * Public catalogue browse.
 *
 * The storefront previously exposed only the carousel and the hot section, so
 * anything else was reachable solely by searching for it by name — fine if you
 * already know the record, useless for browsing. This surfaces the paginated
 * catalogue read that until now only the admin table consumed.
 *
 * Paging is cursor-based, so there is no page-number jumping by design;
 * `pageNum` is display-only, to tell the visitor roughly where they are.
 */
const ProductsPage = () => {
  const [args, setArgs] = useState<PageArgs>({ first: PAGE_SIZE });
  const [pageNum, setPageNum] = useState(1);

  const { data, isPending, isError, isPlaceholderData } = useProducts(args);

  const products = data?.edges?.map((edge) => edge.node) ?? [];
  const pageInfo = data?.pageInfo;

  const goNext = () => {
    if (!pageInfo?.endCursor) return;
    setArgs({ first: PAGE_SIZE, after: pageInfo.endCursor });
    setPageNum((n) => n + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goPrev = () => {
    if (!pageInfo?.startCursor) return;
    setArgs({ last: PAGE_SIZE, before: pageInfo.startCursor });
    setPageNum((n) => Math.max(1, n - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderBody = () => {
    if (isPending) return <GridSkeleton count={PAGE_SIZE} />;
    if (isError) {
      return <Text color="fg.error">Couldn&apos;t load the catalogue. Please retry.</Text>;
    }
    if (products.length === 0) return <Text color="fg.muted">Nothing in the catalogue yet.</Text>;
    return <Grid products={products} />;
  };

  return (
    <PageShell>
      <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading eyebrow="Every record" title="The Catalogue" />

        {renderBody()}

        {products.length > 0 ? (
          <HStack justify="center" gap="4" mt="12">
            <Button
              variant="outline"
              borderRadius="full"
              onClick={goPrev}
              disabled={!pageInfo?.hasPreviousPage || isPlaceholderData}
            >
              Previous
            </Button>
            <Text fontSize="sm" color="fg.muted">
              Page {pageNum}
            </Text>
            <Button
              variant="outline"
              borderRadius="full"
              onClick={goNext}
              disabled={!pageInfo?.hasNextPage || isPlaceholderData}
            >
              Next
            </Button>
          </HStack>
        ) : null}
      </Container>
    </PageShell>
  );
};

export default ProductsPage;
