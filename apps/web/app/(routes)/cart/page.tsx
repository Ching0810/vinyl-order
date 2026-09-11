'use client';

import { Container } from '@chakra-ui/react';

import CartView from '@/components/cart';
import CategoryNav from '@/components/layout/category-nav';
import PageShell from '@/components/layout/page-shell';
import SectionHeading from '@/components/ui/section-heading';

/** The signed-in customer's cart. */
const CartPage = () => (
  <PageShell nav={<CategoryNav />}>
    <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
      <SectionHeading eyebrow="Your order" title="Cart" />
      <CartView />
    </Container>
  </PageShell>
);

export default CartPage;
