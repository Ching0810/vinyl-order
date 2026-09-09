import { Box, Container, Text } from '@chakra-ui/react';

import Hero from '@/components/home/hero';
import Footer from '@/components/layout/footer';
import Header from '@/components/layout/header';
import Grid from '@/components/product/grid';
import Search from '@/components/product/search';
import SectionHeading from '@/components/ui/section-heading';
import { getHotProducts } from '@/services/api/products/hot';

/**
 * Public storefront home. An async Server Component: the hot-products grid is
 * fetched and rendered on the server (good for SEO + fast first paint), while
 * <Header/> and <Search/> are client islands for per-user auth/cart and
 * the live search dropdown. The full catalog is reachable via search, not listed.
 *
 * Layout follows a stacked, modular structure — hero, then titled sections —
 * so new sections can be appended without reworking the page.
 */
const HomePage = async () => {
  const hotProducts = await getHotProducts();

  return (
    <Box minH="100dvh" display="flex" flexDirection="column">
      <Header />

      <Box flex="1">
        <Hero search={<Search />} />

        <Container maxW="7xl" px={{ base: '4', md: '8' }} py={{ base: '12', md: '20' }}>
          <SectionHeading eyebrow="Moving this week" title="Hot Right Now" />

          {hotProducts.length === 0 ? (
            <Text color="fg.muted">No hot products yet.</Text>
          ) : (
            <Grid products={hotProducts} />
          )}
        </Container>
      </Box>

      <Footer />
    </Box>
  );
};

export default HomePage;
