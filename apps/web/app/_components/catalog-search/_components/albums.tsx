'use client';

import { Stack } from '@chakra-ui/react';
import type { CatalogAlbum, CatalogAlbumListing, TrackListingInput } from '@vinyl-order/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import ConfirmDialog from '@/components/ui/confirm-dialog';
import { ambiguousArtistsOf, offerErrorCode } from '@/services/api/catalog/errors';
import { useMe } from '@/services/queries/auth/useMe';
import { useToggleAlbumSplit } from '@/services/queries/catalog/useToggleAlbumSplit';
import { useTrackListing } from '@/services/queries/watches/useTrackListing';

import AlbumCard, { type AlbumCorrections } from './album-card';
import ArtistDialog, { type ArtistQuestion } from './artist-dialog';

/** A track the API asked a question about, to send again with the answer. */
interface Pending extends ArtistQuestion {
  input: TrackListingInput;
}

/**
 * The albums found, each listing of each with a "Track" that puts that one
 * version on the user's list and opens the album's comparison (tracker.md
 * §5.8, §7.3). The album's other listings go with it, so its record holds
 * them all and the comparison is whole — only the one picked is tracked.
 * One track at a time: each reads shops' pages live.
 *
 * When the API can't tell the artist — two own the names, or the title
 * names none — a dialog asks, and the track is sent again with the answer.
 *
 * The admin also corrects albums here, for everyone (§7.3): "Not this
 * album", once confirmed, takes a listing out of its album; "Put back"
 * undoes it.
 *
 * @param albums - the search's albums, best first
 * @param stale - a newer search is loading; the list dims
 */
export default function Albums({ albums, stale }: { albums: CatalogAlbum[]; stale: boolean }) {
  const router = useRouter();
  const { data: user } = useMe();
  const track = useTrackListing();
  const correction = useToggleAlbumSplit();
  const [asking, setAsking] = useState<Pending | null>(null);
  const [splitting, setSplitting] = useState<CatalogAlbumListing | null>(null);

  const send = (input: TrackListingInput, albumTitle: string) =>
    track.mutate(input, {
      onSuccess: (result) => router.push(`/products/${result.product.id}`),
      onError: (error) => {
        const code = offerErrorCode(error);
        if (code === 'ARTIST_AMBIGUOUS' || code === 'ARTIST_UNREAD') {
          setAsking({ input, title: albumTitle, artists: ambiguousArtistsOf(error) });
        }
      },
    });

  /** The listing whose last track failed, and why, if no dialog took it on. */
  const trackFailure = (() => {
    if (!track.isError || asking) return null;
    const code = offerErrorCode(track.error);
    if (code === 'ARTIST_AMBIGUOUS' || code === 'ARTIST_UNREAD') return null;
    return {
      listingId: track.variables.catalogEntryId,
      message:
        code === 'SHOP_PAGE_UNREADABLE'
          ? 'The shop’s page couldn’t be read. Try again in a moment.'
          : 'It couldn’t be tracked. Try again.',
    };
  })();

  /** The listing whose last correction failed. */
  const correctionFailure = correction.isError
    ? {
        listingId: correction.variables.catalogEntryId,
        message: 'The album couldn’t be corrected. Try again.',
      }
    : null;

  /** The admin's corrections, or none for anyone else. */
  const corrections: AlbumCorrections | null =
    user?.role === 'admin'
      ? {
          pendingId: correction.isPending ? correction.variables.catalogEntryId : null,
          onSplit: setSplitting,
          onPutBack: (listing) => correction.mutate({ catalogEntryId: listing.id, split: false }),
        }
      : null;

  const confirmSplit = () => {
    if (!splitting) return;
    correction.mutate(
      { catalogEntryId: splitting.id, split: true },
      { onSettled: () => setSplitting(null) },
    );
  };

  return (
    <>
      <Stack as="ul" gap="0" opacity={stale ? 0.6 : 1} transition="opacity 0.15s">
        {albums.map((album) => (
          <AlbumCard
            key={album.key}
            album={album}
            trackingId={track.isPending ? track.variables.catalogEntryId : null}
            disabled={track.isPending}
            failure={trackFailure ?? correctionFailure}
            onTrack={(listing) =>
              send(
                {
                  catalogEntryId: listing.id,
                  catalogEntryIds: album.listings.map((each) => each.id),
                },
                album.title,
              )
            }
            corrections={corrections}
          />
        ))}
      </Stack>
      <ArtistDialog
        question={asking}
        onClose={() => setAsking(null)}
        onAnswer={(answer) => {
          if (!asking) return;
          setAsking(null);
          send({ ...asking.input, ...answer }, asking.title);
        }}
      />
      <ConfirmDialog
        open={!!splitting}
        onOpenChange={(open) => {
          if (!open) setSplitting(null);
        }}
        title="Take this listing out of its album?"
        body="For everyone: search lists it as an album of its own from now on. A record holding it with others gives it up to a record of its own, with its price history and whoever tracks it. Put back undoes it."
        confirmLabel="Take it out"
        pending={correction.isPending}
        onConfirm={confirmSplit}
      />
    </>
  );
}
