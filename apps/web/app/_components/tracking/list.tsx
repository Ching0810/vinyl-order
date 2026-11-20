'use client';

import { Button, SimpleGrid, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

import GridSkeleton from '@/components/product/grid-skeleton';
import EmptyState from '@/components/ui/empty-state';
import RecordTile from '@/components/ui/record-tile';
import SectionHeading from '@/components/ui/section-heading';
import { AVAILABILITY_BADGE } from '@/lib/utils/catalog-search';
import { formatPrice } from '@/lib/utils/currency';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';
import { useWatches } from '@/services/queries/watches/useWatches';

/** The first row's tiles: on screen at once, so their covers load first. */
const ABOVE_FOLD_COUNT = 4;

/**
 * The signed-in user's tracked versions (tracker.md §12.1): each its own
 * tile with its own price, and a note when the album is cheaper elsewhere.
 * A tile opens the album's comparison.
 */
export default function TrackingList() {
  const { data: watches, isPending, isError } = useWatches({ enabled: true });

  const renderBody = () => {
    if (isPending) return <GridSkeleton count={ABOVE_FOLD_COUNT} />;
    if (isError) {
      return <Text color="fg.error">Couldn&apos;t load what you track. Please retry.</Text>;
    }
    if (watches.length === 0) {
      return (
        <EmptyState
          title="You're not tracking anything yet"
          body="Search the shops by album, and track the versions you want to compare."
          cta={
            <Button asChild colorPalette="brand" borderRadius="full">
              <NextLink href="/">Search the shops</NextLink>
            </Button>
          }
        />
      );
    }
    return (
      <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={{ base: '3', sm: '4', md: '6' }}>
        {watches.map((watch, index) => (
          <RecordTile
            key={watch.offerId}
            open={{ href: `/products/${watch.productId}` }}
            imageUrl={watch.imageUrl}
            title={watch.title}
            artist={watch.artist}
            detail={`${SUPPLIER_LABEL[watch.supplier]} · ${AVAILABILITY_BADGE[watch.availability].label} · ${watch.sourceTitle}`}
            price={formatPrice(watch.priceCents, watch.currency)}
            note={
              watch.cheaperElsewhere
                ? `${formatPrice(watch.cheaperElsewhere.priceCents, watch.cheaperElsewhere.currency)} at ${SUPPLIER_LABEL[watch.cheaperElsewhere.supplier]}`
                : null
            }
            eager={index < ABOVE_FOLD_COUNT}
          />
        ))}
      </SimpleGrid>
    );
  };

  return (
    <>
      <SectionHeading
        eyebrow="Your list"
        title="Tracking"
        action={
          <Button asChild size="sm" variant="outline" borderRadius="full">
            <NextLink href="/">Search the shops</NextLink>
          </Button>
        }
      />
      {renderBody()}
    </>
  );
}
