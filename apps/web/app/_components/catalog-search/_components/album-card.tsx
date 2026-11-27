import { Badge, Button, HStack, Link, Stack, Text } from '@chakra-ui/react';
import { type CatalogAlbum, type CatalogAlbumListing, isBuyable } from '@vinyl-order/shared';
import NextLink from 'next/link';

import AddToCart from '@/components/cart/add-to-cart';
import SupplierBadge from '@/components/supplier-order/supplier-badge';
import Cover from '@/components/ui/cover';
import { AVAILABILITY_BADGE } from '@/lib/utils/catalog-search';
import { formatPrice } from '@/lib/utils/currency';
import { formatTimeAgo } from '@/lib/utils/date';

/**
 * The admin's corrections to an album, for everyone (tracker.md §7.3): take
 * a listing out of it, or put one split before back.
 */
export interface AlbumCorrections {
  /** The listing whose split or put-back is running, if any. */
  pendingId: string | null;
  onSplit: (listing: CatalogAlbumListing) => void;
  onPutBack: (listing: CatalogAlbumListing) => void;
}

/**
 * One album: artist and title, then each listing of it — a version at a
 * shop, with its own cover and the shop's own title, a link there, "Add to
 * cart" when it's in stock, and its own "Track". Two pressings at a shop are
 * two rows: different records, different covers and prices, tracked one at
 * a time. For the admin, each listing of an album of two or more also has
 * "Not this album", and a listing split before has "Put back".
 *
 * @param album - the album
 * @param trackingId - the listing whose track is running, if any
 * @param disabled - a track is running
 * @param failure - the listing whose last track or correction failed, and why
 * @param onTrack - track a listing
 * @param corrections - the admin's, or null for anyone else
 */
export default function AlbumCard({
  album,
  trackingId,
  disabled,
  failure,
  onTrack,
  corrections,
}: {
  album: CatalogAlbum;
  trackingId: string | null;
  disabled: boolean;
  failure: { listingId: string; message: string } | null;
  onTrack: (listing: CatalogAlbumListing) => void;
  corrections: AlbumCorrections | null;
}) {
  return (
    <Stack as="li" gap="3" py="4" borderBottomWidth="1px" borderColor="border.muted">
      <Stack gap="0">
        {album.artist ? (
          <Text fontSize="sm" color="fg.muted" lineClamp={1}>
            {album.artist}
          </Text>
        ) : null}
        <Text fontWeight="semibold" lineClamp={2}>
          {album.title}
        </Text>
      </Stack>
      <Stack as="ul" gap="3">
        {album.listings.map((listing) => (
          <ListingRow
            key={listing.id}
            listing={listing}
            productId={album.productId}
            tracking={trackingId === listing.id}
            disabled={disabled}
            failure={failure?.listingId === listing.id ? failure.message : null}
            onTrack={() => onTrack(listing)}
            correction={correctionOf(listing, album, corrections)}
          />
        ))}
      </Stack>
    </Stack>
  );
}

/** An admin's button on a listing: its label, and what it does. */
interface Correction {
  label: 'Not this album' | 'Put back';
  pending: boolean;
  onClick: () => void;
}

/**
 * The admin's button on a listing, if any: "Put back" on one split before;
 * "Not this album" on one in an album with others, as alone it has nothing
 * to be taken out of.
 */
const correctionOf = (
  listing: CatalogAlbumListing,
  album: CatalogAlbum,
  corrections: AlbumCorrections | null,
): Correction | null => {
  if (!corrections) return null;
  const pending = corrections.pendingId === listing.id;
  if (listing.split) {
    return { label: 'Put back', pending, onClick: () => corrections.onPutBack(listing) };
  }
  if (album.listings.length < 2) return null;
  return { label: 'Not this album', pending, onClick: () => corrections.onSplit(listing) };
};

/**
 * One version at one shop: its cover, shop, whether it can be bought as far
 * as search knows, its own title, "Add to cart" when it's in stock and
 * priced — the demo store sells the shop's listing (tracker.md §8) —
 * "Track" or "Tracking", and the admin's correction.
 */
const ListingRow = ({
  listing,
  productId,
  tracking,
  disabled,
  failure,
  onTrack,
  correction,
}: {
  listing: CatalogAlbumListing;
  productId: string | null;
  tracking: boolean;
  disabled: boolean;
  failure: string | null;
  onTrack: () => void;
  correction: Correction | null;
}) => (
  <Stack as="li" gap="1">
    <HStack gap="3" align="center">
      <Cover src={listing.imageUrl} size={{ base: '14', md: '16' }} px={64} />
      <Stack gap="1" flex="1" minW="0" align="start">
        <HStack gap="1.5" wrap="wrap">
          <SupplierBadge supplier={listing.supplier} />
          <Badge
            colorPalette={AVAILABILITY_BADGE[listing.availability].palette}
            variant={listing.availability === 'unknown' ? 'outline' : 'subtle'}
            borderRadius="full"
          >
            {AVAILABILITY_BADGE[listing.availability].label}
          </Badge>
        </HStack>
        <Link href={listing.url} target="_blank" rel="noreferrer" fontSize="sm" lineClamp={2}>
          {listing.title} ↗
        </Link>
        <StockLine listing={listing} />
      </Stack>
      <Stack gap="2" flexShrink="0" align="end">
        {isBuyable(listing.availability) && listing.priceCents !== null ? (
          <AddToCart catalogEntryId={listing.id} />
        ) : null}
        {listing.watched && productId ? (
          <Button asChild size="xs" variant="subtle" colorPalette="brand" borderRadius="full">
            <NextLink href={`/products/${productId}`}>Tracking</NextLink>
          </Button>
        ) : (
          <Button
            size="xs"
            colorPalette="brand"
            borderRadius="full"
            loading={tracking}
            loadingText="Tracking…"
            disabled={!!disabled && !tracking}
            onClick={onTrack}
          >
            Track
          </Button>
        )}
        {correction ? (
          <Button
            size="xs"
            variant="ghost"
            color="fg.muted"
            borderRadius="full"
            loading={correction.pending}
            onClick={correction.onClick}
          >
            {correction.label}
          </Button>
        ) : null}
      </Stack>
    </HStack>
    {failure ? (
      <Text fontSize="sm" color="fg.error">
        {failure}
      </Text>
    ) : null}
  </Stack>
);

/**
 * The listing's price, its count when the shop keeps one, and how old they
 * are — the list pages are walked nightly (tracker.md §7.2). Nothing when
 * nothing has read it.
 */
const StockLine = ({ listing }: { listing: CatalogAlbumListing }) => {
  if (listing.priceCents === null && listing.checkedAt === null) return null;
  return (
    <HStack gap="2" wrap="wrap" align="baseline">
      {listing.priceCents === null ? null : (
        <Text fontWeight="semibold">{formatPrice(listing.priceCents, listing.currency)}</Text>
      )}
      {listing.stockQty !== null && isBuyable(listing.availability) ? (
        <Text fontSize="sm" color="fg.muted">
          {listing.stockQty} left
        </Text>
      ) : null}
      {listing.checkedAt === null ? null : (
        <Text fontSize="xs" color="fg.subtle">
          checked {formatTimeAgo(listing.checkedAt)}
        </Text>
      )}
    </HStack>
  );
};
