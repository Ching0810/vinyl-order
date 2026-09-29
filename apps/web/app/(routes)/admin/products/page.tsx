'use client';

import { Button, Container, Spinner, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import ProductTable from '@/components/admin/product-table';
import Paginator from '@/components/ui/paginator';
import SectionHeading from '@/components/ui/section-heading';
import { pageCount, useCursorPages } from '@/hooks/useCursorPages';
import { useDeleteProduct } from '@/services/queries/products/useDeleteProduct';
import { useProducts } from '@/services/queries/products/useProducts';

const PAGE_SIZE = 10;

export default function AdminProductList() {
  // Cursor paging over the whole catalogue; see useCursorPages.
  const pages = useCursorPages(PAGE_SIZE);

  const { data, isPending, isPlaceholderData } = useProducts(pages.args);
  const deleteMutation = useDeleteProduct();

  const products = data?.edges?.map((edge) => edge.node) ?? [];

  const renderBody = () => {
    if (isPending) return <Spinner color="fg.muted" />;
    if (!data || products.length === 0) {
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
          page={pages.page}
          totalPages={pageCount(data.totalCount, PAGE_SIZE)}
          hasPrevious={data.pageInfo.hasPreviousPage}
          hasNext={data.pageInfo.hasNextPage}
          busy={isPlaceholderData}
          onChange={(target) => pages.go(target, data)}
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
