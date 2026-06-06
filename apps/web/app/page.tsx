import { Box, Container, Heading, Text } from '@chakra-ui/react';

import Header from '@/components/layout/header';
import ProductGrid from '@/components/product/product-grid';
import { getProducts } from '@/services/api/products/list';

/**
 * Public storefront home. An async Server Component: the product grid is
 * fetched and rendered on the server (good for SEO + fast first paint), while
 * the <Header/> is a client island for the per-user auth state and cart.
 */
const HomePage = async () => {
  const products = await getProducts();

  return (
    <Box>
      <Header />
      <Container maxW="6xl" py="8">
        <Heading size="xl" mb="6">
          New Vinyl
        </Heading>
        {products.length === 0 ? (
          <Text color="fg.muted">No vinyl found.</Text>
        ) : (
          <ProductGrid products={products} />
        )}
      </Container>
    </Box>
  );
};

export default HomePage;
