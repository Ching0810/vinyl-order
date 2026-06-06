import { SimpleGrid } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';

import ProductCard from './product-card';

/** Responsive grid of product tiles (2 cols on mobile → 4 on desktop). */
const ProductGrid = ({ products }: { products: Product[] }) => (
  <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap="6">
    {products.map((product) => (
      <ProductCard key={product.id} product={product} />
    ))}
  </SimpleGrid>
);

export default ProductGrid;
