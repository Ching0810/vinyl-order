'use client';

import { Badge, Box, Button, HStack, Image, Table, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import NextLink from 'next/link';

import { formatPrice } from '@/lib/utils/currency';

/** An empty cell reads as a gap; a dash says "nothing set here". */
const Unset = () => <Text color="fg.subtle">—</Text>;

/**
 * One catalogue row: what an editor scans (cover, release, price, stock, where
 * it is featured) and the two things they can do to it.
 *
 * @param product - the product to show
 * @param deleting - its delete request is in flight
 * @param onDelete - remove this product
 */
const Row = ({
  product,
  deleting,
  onDelete,
}: {
  product: Product;
  deleting: boolean;
  onDelete: () => void;
}) => (
  <Table.Row>
    <Table.Cell>
      {product.imageUrl ? (
        <Image src={product.imageUrl} alt="" boxSize="10" objectFit="cover" borderRadius="sm" />
      ) : null}
    </Table.Cell>
    <Table.Cell truncate>{product.title}</Table.Cell>
    <Table.Cell truncate>{product.artist}</Table.Cell>
    <Table.Cell>{formatPrice(product.priceCents, product.currency)}</Table.Cell>
    <Table.Cell>{product.stock}</Table.Cell>
    <Table.Cell>{product.isHot ? <Badge colorPalette="brand">Hot</Badge> : <Unset />}</Table.Cell>
    <Table.Cell>
      {product.slideOrder !== null ? (
        // Position matters more than the flag here — it's what an editor needs
        // to see to reorder the carousel.
        <Badge colorPalette="brand">#{product.slideOrder}</Badge>
      ) : (
        <Unset />
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
          loading={deleting}
          onClick={onDelete}
        >
          Delete
        </Button>
      </HStack>
    </Table.Cell>
  </Table.Row>
);

/**
 * The admin catalogue table.
 *
 * Eight fixed-width columns can't compress onto a phone, so the table keeps its
 * natural width and scrolls sideways inside its box rather than squeezing the
 * cells illegibly.
 *
 * @param products - the page of products to list
 * @param deletingId - the product whose delete is in flight, if any
 * @param onDelete - remove a product
 */
export default function ProductTable({
  products,
  deletingId,
  onDelete,
}: {
  products: Product[];
  deletingId?: string;
  onDelete: (id: string) => void;
}) {
  return (
    <Box
      overflowX="auto"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="card"
      bg="bg.panel"
    >
      <Table.Root size="sm" variant="line" tableLayout="fixed" minW="3xl">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="20">Cover</Table.ColumnHeader>
            <Table.ColumnHeader w="35">Title</Table.ColumnHeader>
            <Table.ColumnHeader w="30">Artist</Table.ColumnHeader>
            <Table.ColumnHeader w="35">Price</Table.ColumnHeader>
            <Table.ColumnHeader w="30">Stock</Table.ColumnHeader>
            <Table.ColumnHeader w="30">Hot</Table.ColumnHeader>
            <Table.ColumnHeader w="34">Carousel</Table.ColumnHeader>
            <Table.ColumnHeader w="44">Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {products.map((product) => (
            <Row
              key={product.id}
              product={product}
              deleting={deletingId === product.id}
              onDelete={() => onDelete(product.id)}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
