'use client';

import { Badge, Box, Flex, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import type { Offer, ProductWithOffers } from '@vinyl-order/shared';

import Cover from '@/components/ui/cover';
import { useMe } from '@/services/queries/auth/useMe';
import { useWatches } from '@/services/queries/watches/useWatches';

import OfferRow from './_components/offer-row';
import RefreshBar from './_components/refresh-bar';

/** In stock or on pre-order: what can be bought, and what "lowest" counts. */
const isBuyable = (offer: Offer): boolean => offer.availability !== 'sold_out';

/**
 * Buyable first, cheapest first; then sold out, cheapest first — so the top
 * row is the best buy, and what can't be bought is still there to compare.
 */
const byBestBuy = (a: Offer, b: Offer): number =>
  Number(isBuyable(b)) - Number(isBuyable(a)) || a.priceCents - b.priceCents;

/**
 * A tracked record's comparison (tracker.md §12.3): every version of the
 * album at every shop, a row each, with its own cover, title, price,
 * availability, count and expected date, and how old they are. The lowest
 * price that can be bought is marked; the versions the user tracks are
 * highlighted, and tracked or let go from here. Anyone signed in reads the
 * record again; the admin also takes a wrong match off. A version in stock
 * goes into the demo store's cart from its row, as from search: the cart
 * buys the shop's listing (tracker.md §8).
 *
 * @param product - the record and its offers
 */
export default function Comparison({ product }: { product: ProductWithOffers }) {
  const { data: user } = useMe();
  const { data: watches } = useWatches({ enabled: !!user });
  const watched = new Set(watches?.map((watch) => watch.offerId));

  const offers = [...product.offers].sort(byBestBuy);
  const lowest = offers.find(isBuyable)?.priceCents;
  const shops = new Set(offers.map((offer) => offer.supplier)).size;

  return (
    <Stack gap={{ base: '8', md: '10' }}>
      <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: '5', md: '8' }} align="start">
        <Cover src={product.imageUrl} size={{ base: '40', md: '56' }} px={224} radius="card" />
        <Stack gap="2" minW="0">
          <Text fontSize={{ base: 'lg', md: 'xl' }} color="fg.muted">
            {product.artist.name}
          </Text>
          <Heading as="h1" textStyle="display" fontSize={{ base: '3xl', md: '5xl' }}>
            {product.title}
          </Heading>
          <HStack gap="2" wrap="wrap">
            {product.format.map((format) => (
              <Badge key={format} variant="outline">
                {format}
              </Badge>
            ))}
            {product.edition ? <Badge variant="outline">{product.edition}</Badge> : null}
          </HStack>
          <Text color="fg.muted" fontSize="sm">
            {offers.length === 1
              ? 'One version, at one shop.'
              : `${offers.length} versions at ${shops} ${shops === 1 ? 'shop' : 'shops'}.`}
          </Text>
        </Stack>
      </Flex>

      <Box>
        <RefreshBar product={product} signedIn={!!user} />
        <Stack as="ul" gap="0" borderTopWidth="1px" borderColor="border.muted">
          {offers.map((offer) => (
            <OfferRow
              key={offer.id}
              productId={product.id}
              fallbackImageUrl={product.imageUrl}
              offer={offer}
              lowest={isBuyable(offer) && offer.priceCents === lowest}
              watched={watched.has(offer.id)}
              signedIn={!!user}
              isAdmin={user?.role === 'admin'}
            />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
