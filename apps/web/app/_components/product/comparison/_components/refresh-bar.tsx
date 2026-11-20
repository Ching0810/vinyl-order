'use client';

import { Button, HStack, Text } from '@chakra-ui/react';
import type { ProductWithOffers } from '@vinyl-order/shared';

import { formatTimeAgo } from '@/lib/utils/date';
import { retryAfterSecondsOf } from '@/services/api/catalog/errors';
import { useRefreshProduct } from '@/services/queries/offers/useRefreshProduct';

/**
 * How old the comparison is, and "Refresh" — every offer read again from its
 * shop's page, live, for anyone signed in. A record is read at most every
 * ten minutes, so many pressing it read the shops once; within that, the
 * button says when it can be pressed again.
 *
 * @param product - the record, for its offers' last reads
 * @param signedIn - whether to offer the button at all
 */
export default function RefreshBar({
  product,
  signedIn,
}: {
  product: ProductWithOffers;
  signedIn: boolean;
}) {
  const refresh = useRefreshProduct(product.id);
  const lastChecked = product.offers
    .map((offer) => offer.lastCheckedAt)
    .sort()
    .at(-1);

  const tooSoon = retryAfterSecondsOf(refresh.error);
  const message = (() => {
    if (tooSoon !== undefined) {
      return `Refreshed a moment ago — again in ${Math.max(1, Math.ceil(tooSoon / 60))} min.`;
    }
    return refresh.isError ? 'The shops couldn’t be read. Try again.' : null;
  })();

  return (
    <HStack justify="space-between" gap="3" wrap="wrap" mb="3">
      <Text fontSize="sm" color="fg.muted">
        {lastChecked ? `Prices checked ${formatTimeAgo(lastChecked)}` : null}
        {message ? (
          <Text as="span" color={tooSoon === undefined ? 'fg.error' : 'fg.muted'}>
            {' · '}
            {message}
          </Text>
        ) : null}
      </Text>
      {signedIn ? (
        <Button
          size="sm"
          variant="outline"
          borderRadius="full"
          loading={refresh.isPending}
          loadingText="Reading the shops…"
          onClick={() => refresh.mutate()}
        >
          Refresh
        </Button>
      ) : null}
    </HStack>
  );
}
