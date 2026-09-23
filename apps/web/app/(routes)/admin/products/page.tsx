'use client';

import { Button, Container, Spinner, Text } from '@chakra-ui/react';
import type { PageArgs } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useState } from 'react';

import ProductTable from '@/components/admin/product-table';
import Paginator from '@/components/ui/paginator';
import SectionHeading from '@/components/ui/section-heading';
import { useDeleteProduct } from '@/services/queries/products/useDeleteProduct';
import { useProducts } from '@/services/queries/products/useProducts';

const PAGE_SIZE = 10;

export default function AdminProductList() {
  // Cursor window into the catalog; `pageNum` is display-only (cursor paging has
  // no real page index, but users still want to know roughly where they are).
  const [args, setArgs] = useState<PageArgs>({ first: PAGE_SIZE });
  const [pageNum, setPageNum] = useState(1);

  const { data, isPending, isPlaceholderData } = useProducts(args);
  const deleteMutation = useDeleteProduct();

  const products = data?.edges?.map((edge) => edge.node) ?? [];
  const pageInfo = data?.pageInfo;

  const goNext = () => {
    if (!pageInfo?.endCursor) return;
    setArgs({ first: PAGE_SIZE, after: pageInfo.endCursor });
    setPageNum((n) => n + 1);
  };

  const goPrev = () => {
    if (!pageInfo?.startCursor) return;
    setArgs({ last: PAGE_SIZE, before: pageInfo.startCursor });
    setPageNum((n) => Math.max(1, n - 1));
  };

  const renderBody = () => {
    if (isPending) return <Spinner color="fg.muted" />;
    if (products.length === 0) {
      return <Text color="fg.muted">No products yet. Add your first one.</Text>;
    }
    return (
      <>
        <ProductTable
          products={products}
          deletingId={deleteMutation.isPending ? deleteMutation.variables : undefined}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
        <Paginator
          pageNum={pageNum}
          hasPrevious={Boolean(pageInfo?.hasPreviousPage)}
          hasNext={Boolean(pageInfo?.hasNextPage)}
          busy={isPlaceholderData}
          onPrevious={goPrev}
          onNext={goNext}
        />
      </>
    );
  };

  return (
    <Container maxW="6xl" px={{ base: '4', md: '8' }} py={{ base: '6', md: '10' }}>
      <SectionHeading
        eyebrow="Catalogue"
        title="Products"
        description="Everything in the shop. Edit pricing, stock and where each record is featured."
        action={
          <Button asChild size="sm" colorPalette="brand" borderRadius="full">
            <NextLink href="/admin/products/new">Add product</NextLink>
          </Button>
        }
      />

      {renderBody()}
    </Container>
  );
}
