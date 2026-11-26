'use client';

import { Button, Stack } from '@chakra-ui/react';

import AddToCart from '@/components/cart/add-to-cart';
import { useToggleWatch } from '@/services/queries/watches/useToggleWatch';

/**
 * An offer's buttons: "Add to cart" when it's in stock and still in the
 * shop's catalog, which the demo store sells (tracker.md §8); and "Track",
 * or "Tracking" to let it go, for anyone signed in. A wrong match is
 * corrected in search, not here (§7.3).
 *
 * @param offerId - the offer
 * @param catalogEntryId - its listing in the copied catalog, when the demo sells it
 * @param watched - the user tracks it
 * @param signedIn - whether tracking is offered
 */
export default function OfferActions({
  offerId,
  catalogEntryId,
  watched,
  signedIn,
}: {
  offerId: string;
  catalogEntryId: string | null;
  watched: boolean;
  signedIn: boolean;
}) {
  const toggle = useToggleWatch();

  return (
    <Stack gap="2" flexShrink="0" align="end">
      {catalogEntryId ? <AddToCart catalogEntryId={catalogEntryId} /> : null}
      {signedIn ? (
        <Button
          size="xs"
          borderRadius="full"
          variant={watched ? 'subtle' : 'solid'}
          colorPalette="brand"
          loading={toggle.isPending}
          onClick={() => toggle.mutate({ offerId, watch: !watched })}
        >
          {watched ? 'Tracking' : 'Track'}
        </Button>
      ) : null}
    </Stack>
  );
}
