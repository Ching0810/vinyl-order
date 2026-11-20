import { Box, Stack, Text } from '@chakra-ui/react';
import Image from 'next/image';
import NextLink from 'next/link';

/**
 * A record as a home page tile: cover, title and artist, a line saying
 * which version or where, a price, and a note under it. The storefront's
 * card (product/card.tsx) in look; the price here is a shop's, not the demo
 * store's own.
 *
 * @param href - where it opens: a tracked record's comparison, or a search
 * @param imageUrl - the cover, on a host next.config.ts allows
 * @param title - the album, or the shop's title for a listing
 * @param artist - the artist, or the shop a listing is at
 * @param detail - which version, or whether it can be bought
 * @param price - the price to show, already formatted; null when there is none
 * @param note - a line under the price, e.g. where it's cheaper
 * @param eager - load the cover at once: the tile is in the first row
 */
export default function RecordTile({
  href,
  imageUrl,
  title,
  artist,
  detail,
  price,
  note,
  eager = false,
}: {
  href: string;
  imageUrl: string | null;
  title: string;
  artist: string;
  detail: string;
  price: string | null;
  note: string | null;
  eager?: boolean;
}) {
  return (
    <Stack
      asChild
      className="group"
      gap="0"
      borderRadius="card"
      overflow="hidden"
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.muted"
      transition="transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease"
      _hover={{ transform: 'translateY(-4px)', boxShadow: 'lift', borderColor: 'border' }}
    >
      <NextLink href={href}>
        <Box position="relative" aspectRatio="1" bg="bg.muted" overflow="hidden">
          {imageUrl ? (
            <Box
              position="absolute"
              inset="0"
              transition="transform 0.4s ease"
              _groupHover={{ transform: 'scale(1.06)' }}
            >
              <Image
                src={imageUrl}
                alt={`${artist} – ${title}`}
                fill
                sizes="(max-width: 48rem) 50vw, (max-width: 62rem) 33vw, 25vw"
                style={{ objectFit: 'cover' }}
                loading={eager ? 'eager' : 'lazy'}
                fetchPriority={eager ? 'high' : undefined}
              />
            </Box>
          ) : null}
        </Box>
        <Stack gap="1.5" p="4" flex="1">
          <Text fontWeight="semibold" lineClamp={2} letterSpacing="display">
            {title}
          </Text>
          <Text fontSize="sm" color="fg.muted" lineClamp={1}>
            {artist}
          </Text>
          <Text fontSize="xs" color="fg.subtle" lineClamp={2}>
            {detail}
          </Text>
          <Stack gap="0.5" pt="1" mt="auto">
            <Text fontWeight="bold" fontSize="lg">
              {price ?? '—'}
            </Text>
            {note ? (
              <Text fontSize="xs" color="brand.fg">
                {note}
              </Text>
            ) : null}
          </Stack>
        </Stack>
      </NextLink>
    </Stack>
  );
}
