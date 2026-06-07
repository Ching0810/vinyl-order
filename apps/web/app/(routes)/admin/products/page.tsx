'use client';

import {
  Badge,
  Button,
  Container,
  HStack,
  Heading,
  Image,
  Spinner,
  Table,
  Text,
} from '@chakra-ui/react';
import type { PageArgs } from '@vinyl-order/shared';
import NextLink from 'next/link';
import { useState } from 'react';

import AdminGuard from '@/components/admin/admin-guard';
import { useDeleteProduct } from '@/services/queries/products/use-delete-product';
import { useProducts } from '@/services/queries/products/use-products';

const PAGE_SIZE = 10;

/** Formats integer cents back into a currency string for display. */
const formatPrice = (priceCents: number, currency: string) =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(priceCents / 100);

const AdminProductList = () => {
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

  return (
    <Container maxW="6xl" py="8">
      <HStack justify="space-between" mb="6">
        <Heading size="lg">Products</Heading>
        <HStack gap="2">
          <Button asChild variant="ghost">
            <NextLink href="/">Back to store</NextLink>
          </Button>
          <Button asChild>
            <NextLink href="/admin/products/new">Add product</NextLink>
          </Button>
        </HStack>
      </HStack>

      {isPending ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Text color="fg.muted">No products yet. Add your first one.</Text>
      ) : (
        <>
          <Table.Root size="sm" variant="line" tableLayout="fixed">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader w="20">Cover</Table.ColumnHeader>
                <Table.ColumnHeader w="35">Title</Table.ColumnHeader>
                <Table.ColumnHeader w="30">Artist</Table.ColumnHeader>
                <Table.ColumnHeader w="35">Price</Table.ColumnHeader>
                <Table.ColumnHeader w="30">Stock</Table.ColumnHeader>
                <Table.ColumnHeader w="30">Hot</Table.ColumnHeader>
                <Table.ColumnHeader w="44">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {products.map((product) => (
                <Table.Row key={product.id}>
                  <Table.Cell>
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt=""
                        boxSize="10"
                        objectFit="cover"
                        borderRadius="sm"
                      />
                    ) : null}
                  </Table.Cell>
                  <Table.Cell truncate>{product.title}</Table.Cell>
                  <Table.Cell truncate>{product.artist}</Table.Cell>
                  <Table.Cell>{formatPrice(product.priceCents, product.currency)}</Table.Cell>
                  <Table.Cell>{product.stock}</Table.Cell>
                  <Table.Cell>
                    {product.isHot ? (
                      <Badge colorPalette="red">Hot</Badge>
                    ) : (
                      <Text color="fg.subtle">—</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <HStack gap="2" justify="start">
                      <Button asChild size="xs" variant="outline">
                        <NextLink href={`/admin/products/${product.id}/edit`}>Edit</NextLink>
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        colorPalette="red"
                        loading={
                          !!deleteMutation.isPending && deleteMutation.variables === product.id
                        }
                        onClick={() => deleteMutation.mutate(product.id)}
                      >
                        Delete
                      </Button>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          <HStack justify="center" gap="4" mt="6">
            <Button
              size="sm"
              variant="outline"
              onClick={goPrev}
              disabled={!pageInfo?.hasPreviousPage || isPlaceholderData}
            >
              Previous
            </Button>
            <Text fontSize="sm" color="fg.muted">
              Page {pageNum}
            </Text>
            <Button
              size="sm"
              variant="outline"
              onClick={goNext}
              disabled={!pageInfo?.hasNextPage || isPlaceholderData}
            >
              Next
            </Button>
          </HStack>
        </>
      )}
    </Container>
  );
};

const AdminProductsPage = () => (
  <AdminGuard>
    <AdminProductList />
  </AdminGuard>
);

export default AdminProductsPage;
