import { SimpleGrid } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';

import Card from './card';

/**
 * Tiles in the widest first row (4 at the `lg` breakpoint). These are above the
 * fold on load and are the LCP candidates, so they skip lazy loading. On
 * narrower screens this eagerly loads a couple of extra covers — a cheap trade
 * for not deferring the one image that decides the LCP score.
 */
const ABOVE_FOLD_COUNT = 4;

/**
 * Responsive grid of product tiles. Column count and gutter both step up with
 * the viewport: two dense columns on a phone, four airy ones on a desktop.
 */
const Grid = ({ products }: { products: Product[] }) => (
  <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={{ base: '3', sm: '4', md: '6' }}>
    {products.map((product, index) => (
      <Card key={product.id} product={product} eager={index < ABOVE_FOLD_COUNT} />
    ))}
  </SimpleGrid>
);

export default Grid;
