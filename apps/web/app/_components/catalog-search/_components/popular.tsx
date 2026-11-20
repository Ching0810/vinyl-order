'use client';

import { SimpleGrid, Text } from '@chakra-ui/react';

import GridSkeleton from '@/components/product/grid-skeleton';
import RecordTile from '@/components/ui/record-tile';
import SectionHeading from '@/components/ui/section-heading';
import { AVAILABILITY_BADGE } from '@/lib/utils/catalog-search';
import { formatPrice } from '@/lib/utils/currency';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';
import { usePopular } from '@/services/queries/catalog/usePopular';

/** The first row's tiles: on screen at once, so their covers load first. */
const ABOVE_FOLD_COUNT = 4;

/**
 * What's popular at the shops: the records their home pages feature —
 * Cosmic's slideshow, THT's featured row, Rotten Blues' picks (tracker.md
 * §7.2) — shown before anything
 * is searched. From the shops' public pages only: nothing says what anyone
 * tracks. A tile searches for its album.
 *
 * @param onPick - search for these words
 */
export default function Popular({ onPick }: { onPick: (words: string) => void }) {
  const { data: listings, isPending, isError } = usePopular();

  const renderBody = () => {
    if (isPending) return <GridSkeleton count={ABOVE_FOLD_COUNT} />;
    if (isError) {
      return <Text color="fg.error">Couldn&apos;t load what&apos;s popular. Please retry.</Text>;
    }
    if (listings.length === 0) return <Text color="fg.muted">Nothing to show yet.</Text>;
    return (
      <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={{ base: '3', sm: '4', md: '6' }}>
        {listings.map((listing, index) => (
          <RecordTile
            key={listing.id}
            open={{ onSelect: () => onPick(listing.searchQuery) }}
            imageUrl={listing.imageUrl}
            title={listing.title}
            artist={SUPPLIER_LABEL[listing.supplier]}
            detail={AVAILABILITY_BADGE[listing.availability].label}
            price={formatPrice(listing.priceCents, listing.currency)}
            note="Compare across the shops"
            eager={index < ABOVE_FOLD_COUNT}
          />
        ))}
      </SimpleGrid>
    );
  };

  return (
    <>
      <SectionHeading
        eyebrow="At the shops"
        title="Popular now"
        description="What the shops feature on their own front pages. Pick one to compare it across the shops."
      />
      {renderBody()}
    </>
  );
}
