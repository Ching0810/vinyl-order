'use client';

import { Button, Container, Spinner } from '@chakra-ui/react';
import NextLink from 'next/link';

import EmptyState from '@/components/ui/empty-state';
import SectionHeading from '@/components/ui/section-heading';
import type { CatalogSearchState } from '@/lib/utils/catalog-search';
import { useMe } from '@/services/queries/auth/useMe';

import AlbumSearch from './_components/album-search';

/**
 * The shops' copied catalogs searched by album, to track one (tracker.md
 * §12.1, §12.3). Signed in only: tracking is each member's own.
 *
 * @param search - the search the URL describes
 */
export default function CatalogSearch({ search }: { search: CatalogSearchState }) {
  const { data: user, isPending } = useMe();

  const renderBody = () => {
    if (isPending) return <Spinner color="fg.muted" />;
    if (!user) {
      return (
        <EmptyState
          title="Sign in to search the shops"
          body="Search every shop by album, and track the ones you want to compare."
          cta={
            <Button asChild colorPalette="brand" borderRadius="full">
              <NextLink href="/login">Sign in</NextLink>
            </Button>
          }
        />
      );
    }
    return <AlbumSearch search={search} />;
  };

  return (
    <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '6', md: '10' }}>
      <SectionHeading
        eyebrow="Shops"
        title="Search the shops"
        description="Every shop's listings by album, copied nightly. Track one to compare its prices."
      />
      {renderBody()}
    </Container>
  );
}
