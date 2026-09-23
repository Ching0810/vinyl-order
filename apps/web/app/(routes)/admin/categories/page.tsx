'use client';

import { Button, Container } from '@chakra-ui/react';
import NextLink from 'next/link';

import CategoryManager from '@/components/admin/categories';
import SectionHeading from '@/components/ui/section-heading';
/** Admin screen for the storefront category tabs. */
export default function AdminCategoriesPage() {
  return (
    <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '8', md: '12' }}>
      <SectionHeading
        eyebrow="Storefront"
        title="Categories"
        description="The tabs in the storefront header. Products are filed into them from each product's own form."
        action={
          <Button asChild size="sm" variant="outline" borderRadius="full">
            <NextLink href="/">View store</NextLink>
          </Button>
        }
      />
      <CategoryManager />
    </Container>
  );
}
