import { SimpleGrid } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';

import ProductCard from './product-card';

/**
 * Tiles in the widest first row (4 at the `lg` breakpoint). These are above the
 * fold on load and are the LCP candidates, so they skip lazy loading. On
 * narrower screens this eagerly loads a couple of extra covers — a cheap trade
 * for not deferring the one image that decides the LCP score.
 */
const ABOVE_FOLD_COUNT = 4;

/** Responsive grid of product tiles (2 cols on mobile → 4 on desktop). */
const ProductGrid = ({ products }: { products: Product[] }) => (
  <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap="6">
    {products.map((product, index) => (
      <ProductCard key={product.id} product={product} eager={index < ABOVE_FOLD_COUNT} />
    ))}
  </SimpleGrid>
);

export default ProductGrid;
