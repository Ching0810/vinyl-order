'use client';

import { Button, Container } from '@chakra-ui/react';
import NextLink from 'next/link';

import HeroManager from '@/components/admin/hero';
import SectionHeading from '@/components/ui/section-heading';

/**
 * Admin screen for the storefront hero carousel: which records appear in it and
 * in what order.
 */
const AdminHeroPage = () => (
  <Container maxW="3xl" px={{ base: '4', md: '8' }} py={{ base: '8', md: '12' }}>
    <SectionHeading
      eyebrow="Storefront"
      title="Hero carousel"
      description="Choose the records that lead the home page, and the order they rotate in."
      action={
        <Button asChild size="sm" variant="outline" borderRadius="full">
          <NextLink href="/">View store</NextLink>
        </Button>
      }
    />
    <HeroManager />
  </Container>
);

export default AdminHeroPage;
