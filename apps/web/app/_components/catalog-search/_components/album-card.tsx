import { Badge, Box, Button, HStack, Link, Stack, Text } from '@chakra-ui/react';
import type { CatalogAlbum, CatalogAlbumListing } from '@vinyl-order/shared';
import NextLink from 'next/link';

import SupplierBadge from '@/components/supplier-order/supplier-badge';
import Cover from '@/components/ui/cover';
import { AVAILABILITY_BADGE } from '@/lib/utils/catalog-search';

/**
 * One album: artist and title, then each listing of it — a version at a
 * shop, with its own cover and the shop's own title, a link there and its
 * own "Track". Two pressings at a shop are two rows: different records,
 * different covers and prices, tracked one at a time. No price here: the catalogs carry none (tracker.md
 * §12.3); the record's page reads them.
 *
 * @param album - the album
 * @param trackingId - the listing whose track is running, if any
 * @param disabled - a track is running
 * @param failure - the listing whose last track failed, and why
 * @param onTrack - track a listing
 */
export default function AlbumCard({
  album,
  trackingId,
  disabled,
  failure,
  onTrack,
}: {
  album: CatalogAlbum;
  trackingId: string | null;
  disabled: boolean;
  failure: { listingId: string; message: string } | null;
  onTrack: (listing: CatalogAlbumListing) => void;
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
          />
        ))}
      </Stack>
    </Stack>
  );
}

/**
 * One version at one shop: its cover, shop, whether it can be bought as far
 * as search knows, its own title, and "Track" or "Tracking".
 */
const ListingRow = ({
  listing,
  productId,
  tracking,
  disabled,
  failure,
  onTrack,
}: {
  listing: CatalogAlbumListing;
  productId: string | null;
  tracking: boolean;
  disabled: boolean;
  failure: string | null;
  onTrack: () => void;
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
      </Stack>
      <Box flexShrink="0">
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
      </Box>
    </HStack>
    {failure ? (
      <Text fontSize="sm" color="fg.error">
        {failure}
      </Text>
    ) : null}
  </Stack>
);
