'use client';

import { Container } from '@chakra-ui/react';

import SectionHeading from '@/components/ui/section-heading';
import type { CatalogSearchState } from '@/lib/utils/catalog-search';

import AlbumSearch from './_components/album-search';

/**
 * The shops' copied catalogs searched by album, to track one (tracker.md
 * §12.1, §12.3): the home page.
 *
 * @param search - the search the URL describes
 */
export default function CatalogSearch({ search }: { search: CatalogSearchState }) {
  return (
    <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '6', md: '10' }}>
      <SectionHeading
        eyebrow="Shops"
        title="Search the shops"
        description="Every shop's listings by album, copied nightly. Track one to compare its prices."
      />
      <AlbumSearch search={search} />
    </Container>
  );
}
