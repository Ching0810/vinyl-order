'use client';

import { Button, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import ConfirmDialog from '@/components/ui/confirm-dialog';
import { offerErrorCode } from '@/services/api/catalog/errors';
import { useDetachOffer } from '@/services/queries/offers/useDetachOffer';
import { useToggleWatch } from '@/services/queries/watches/useToggleWatch';

/**
 * An offer's buttons: "Track", or "Tracking" to let it go, for anyone signed
 * in; and for the admin, "Not this album" — a wrong match taken off the
 * record, once confirmed, its history with it.
 *
 * @param productId - the record, for detaching
 * @param offerId - the offer
 * @param watched - the user tracks it
 * @param signedIn - whether tracking is offered
 * @param isAdmin - whether detaching is offered
 */
export default function OfferActions({
  productId,
  offerId,
  watched,
  signedIn,
  isAdmin,
}: {
  productId: string;
  offerId: string;
  watched: boolean;
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const toggle = useToggleWatch();
  const detach = useDetachOffer(productId);
  const [confirming, setConfirming] = useState(false);

  return (
    <Stack gap="2" flexShrink="0" align="end">
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
      {isAdmin ? (
        <>
          <Button
            size="xs"
            variant="ghost"
            color="fg.muted"
            borderRadius="full"
            onClick={() => setConfirming(true)}
          >
            Not this album
          </Button>
          {detach.isError ? (
            <Text fontSize="xs" color="fg.error" textAlign="end" maxW="32">
              {offerErrorCode(detach.error) === 'LAST_OFFER'
                ? 'A record keeps at least one offer.'
                : 'It couldn’t be taken off. Try again.'}
            </Text>
          ) : null}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Take this listing off the record?"
            body="Its price history goes with it. The listing stays in search, to be tracked again under the right album."
            confirmLabel="Take it off"
            pending={detach.isPending}
            onConfirm={() => detach.mutate(offerId, { onSettled: () => setConfirming(false) })}
          />
        </>
      ) : null}
    </Stack>
  );
}
