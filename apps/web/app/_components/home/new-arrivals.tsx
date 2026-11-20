'use client';

import { SimpleGrid, Text } from '@chakra-ui/react';

import GridSkeleton from '@/components/product/grid-skeleton';
import SectionHeading from '@/components/ui/section-heading';
import { AVAILABILITY_BADGE, catalogSearchHref } from '@/lib/utils/catalog-search';
import { formatPrice } from '@/lib/utils/currency';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';
import { useNewArrivals } from '@/services/queries/catalog/useNewArrivals';

import RecordTile from './record-tile';

/** The first row's tiles: on screen at once, so their covers load first. */
const ABOVE_FOLD_COUNT = 4;

/**
 * The shops' new arrivals, the home page for someone not signed in
 * (tracker.md §12.1): what the nightly sync copied lately, at its price.
 * From the shops' public catalogs only — nothing says what anyone tracks.
 * A tile searches for its album, to compare it across the shops and track
 * it once signed in.
 */
export default function NewArrivals() {
  const { data: arrivals, isPending, isError } = useNewArrivals();

  const renderBody = () => {
    if (isPending) return <GridSkeleton count={ABOVE_FOLD_COUNT} />;
    if (isError) return <Text color="fg.error">Couldn&apos;t load new records. Please retry.</Text>;
    if (arrivals.length === 0) return <Text color="fg.muted">Nothing new at the shops yet.</Text>;
    return (
      <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={{ base: '3', sm: '4', md: '6' }}>
        {arrivals.map((arrival, index) => (
          <RecordTile
            key={arrival.id}
            href={catalogSearchHref({
              q: arrival.searchQuery,
              supplier: undefined,
              used: false,
              nonVinyl: false,
            })}
            imageUrl={arrival.imageUrl}
            title={arrival.title}
            artist={SUPPLIER_LABEL[arrival.supplier]}
            detail={AVAILABILITY_BADGE[arrival.availability].label}
            price={formatPrice(arrival.priceCents, arrival.currency)}
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
        eyebrow="Just in"
        title="New at the shops"
        description="The latest records the shops have listed. Sign in to compare them and track the ones you want."
      />
      {renderBody()}
    </>
  );
}
