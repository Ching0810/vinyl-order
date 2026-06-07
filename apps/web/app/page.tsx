import { Box, Container, Heading, Text } from '@chakra-ui/react';

import Header from '@/components/layout/header';
import ProductGrid from '@/components/product/product-grid';
import ProductSearch from '@/components/product/product-search';
import { getHotProducts } from '@/services/api/products/hot';

/**
 * Public storefront home. An async Server Component: the hot-products grid is
 * fetched and rendered on the server (good for SEO + fast first paint), while
 * <Header/> and <ProductSearch/> are client islands for per-user auth/cart and
 * the live search dropdown. The full catalog is reachable via search, not listed.
 */
const HomePage = async () => {
  const hotProducts = await getHotProducts();

  return (
    <Box>
      <Header />
      <Container maxW="6xl" py="8">
        <Box mb="10">
          <ProductSearch />
        </Box>

        <Heading size="xl" mb="6">
          Hot Right Now
        </Heading>
        {hotProducts.length === 0 ? (
          <Text color="fg.muted">No hot products yet.</Text>
        ) : (
          <ProductGrid products={hotProducts} />
        )}
      </Container>
    </Box>
  );
};

export default HomePage;
