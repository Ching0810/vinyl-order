'use client';

import { Badge, HStack, Link, Stack, Text, chakra } from '@chakra-ui/react';
import type { Offer } from '@vinyl-order/shared';

import SupplierBadge from '@/components/supplier-order/supplier-badge';
import Cover from '@/components/ui/cover';
import { AVAILABILITY_BADGE } from '@/lib/utils/catalog-search';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay, formatTimeAgo } from '@/lib/utils/date';

import OfferActions from './offer-actions';

/**
 * One version at one shop: its own cover, the shop and its own title — a
 * link there — the price, marked when it's the lowest that can be bought,
 * availability, count and expected date, and how old they are. A version
 * the user tracks is highlighted.
 *
 * @param productId - the record, for detaching
 * @param fallbackImageUrl - the record's cover, for an offer read before covers were kept
 * @param offer - the offer
 * @param lowest - its price is the lowest that can be bought
 * @param watched - the user tracks it
 * @param signedIn - whether tracking is offered
 * @param isAdmin - whether detaching is offered
 */
export default function OfferRow({
  productId,
  fallbackImageUrl,
  offer,
  lowest,
  watched,
  signedIn,
  isAdmin,
}: {
  productId: string;
  fallbackImageUrl: string | null;
  offer: Offer;
  lowest: boolean;
  watched: boolean;
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const badge = AVAILABILITY_BADGE[offer.availability];

  return (
    <chakra.li
      listStyleType="none"
      py="4"
      px={{ base: '0', md: '3' }}
      borderBottomWidth="1px"
      borderColor="border.muted"
      bg={watched ? 'brand.subtle' : undefined}
    >
      <HStack gap={{ base: '3', md: '4' }} align="start">
        <Cover src={offer.imageUrl ?? fallbackImageUrl} size={{ base: '16', md: '20' }} px={80} />
        <Stack gap="1.5" flex="1" minW="0">
          <HStack gap="1.5" wrap="wrap">
            <SupplierBadge supplier={offer.supplier} />
            <Badge colorPalette={badge.palette} variant="subtle" borderRadius="full">
              {badge.label}
            </Badge>
            {lowest ? (
              <Badge colorPalette="brand" variant="solid" borderRadius="full">
                Lowest
              </Badge>
            ) : null}
          </HStack>
          <Link href={offer.url} target="_blank" rel="noreferrer" fontSize="sm" lineClamp={2}>
            {offer.sourceTitle} ↗
          </Link>
          <OfferFacts offer={offer} />
        </Stack>
        <OfferActions
          productId={productId}
          offerId={offer.id}
          catalogEntryId={offer.availability === 'in_stock' ? offer.catalogEntryId : null}
          watched={watched}
          signedIn={signedIn}
          isAdmin={isAdmin}
        />
      </HStack>
    </chakra.li>
  );
}

/**
 * Price, count, expected date and how old they are; and, when the last
 * refresh couldn't read the page, that these are the read before (§5.2).
 */
const OfferFacts = ({ offer }: { offer: Offer }) => (
  <>
    <HStack gap="3" wrap="wrap" align="baseline">
      <Text fontSize="lg" fontWeight="bold">
        {formatPrice(offer.priceCents, offer.currency)}
      </Text>
      {offer.stockQty !== null && offer.availability === 'in_stock' ? (
        <Text fontSize="sm" color="fg.muted">
          {offer.stockQty} left
        </Text>
      ) : null}
      {offer.expectedAt ? (
        <Text fontSize="sm" color="fg.muted">
          Expected {formatDay(offer.expectedAt)}
        </Text>
      ) : null}
      <Text fontSize="xs" color="fg.subtle">
        checked {formatTimeAgo(offer.lastCheckedAt)}
      </Text>
    </HStack>
    {offer.lastError ? (
      <Text fontSize="xs" color="fg.warning">
        The last refresh couldn’t read this page; showing the read before.
      </Text>
    ) : null}
  </>
);
