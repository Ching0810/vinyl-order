'use client';

import { Stack } from '@chakra-ui/react';
import type { CatalogAlbum, TrackListingInput } from '@vinyl-order/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ambiguousArtistsOf, offerErrorCode } from '@/services/api/catalog/errors';
import { useTrackListing } from '@/services/queries/watches/useTrackListing';

import AlbumCard from './album-card';
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
 * @param albums - the search's albums, best first
 * @param stale - a newer search is loading; the list dims
 */
export default function Albums({ albums, stale }: { albums: CatalogAlbum[]; stale: boolean }) {
  const router = useRouter();
  const track = useTrackListing();
  const [asking, setAsking] = useState<Pending | null>(null);

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
  const failure = (() => {
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

  return (
    <>
      <Stack as="ul" gap="0" opacity={stale ? 0.6 : 1} transition="opacity 0.15s">
        {albums.map((album) => (
          <AlbumCard
            key={album.key}
            album={album}
            trackingId={track.isPending ? track.variables.catalogEntryId : null}
            disabled={track.isPending}
            failure={failure}
            onTrack={(listing) =>
              send(
                {
                  catalogEntryId: listing.id,
                  catalogEntryIds: album.listings.map((each) => each.id),
                },
                album.title,
              )
            }
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
    </>
  );
}
