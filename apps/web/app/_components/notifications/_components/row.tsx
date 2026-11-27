import { Box, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import type { Notification } from '@vinyl-order/shared';
import NextLink from 'next/link';

import Cover from '@/components/ui/cover';
import { formatPrice } from '@/lib/utils/currency';
import { formatTimeAgo } from '@/lib/utils/date';
import { SUPPLIER_LABEL } from '@/lib/utils/supplier-order';

/**
 * One price drop (tracker.md §5.10, §12.3): the version's cover, the album
 * and its shop, the price before and after and by how much, and when it was
 * seen. It opens the album's comparison. Unread is marked with a dot.
 *
 * @param notification - the drop, with what the page shows of its version
 */
export default function Row({ notification }: { notification: Notification }) {
  const { fromPriceCents, toPriceCents, currency } = notification;
  const unread = notification.readAt === null;

  return (
    <chakra.li listStyleType="none">
      <HStack
        asChild
        gap="4"
        p="4"
        align="start"
        borderWidth="1px"
        borderColor={unread ? 'brand.muted' : 'border.muted'}
        borderRadius="card"
        bg={unread ? 'brand.subtle' : 'bg.panel'}
        _hover={{ bg: 'bg.muted' }}
        transition="background 0.15s"
      >
        <NextLink href={`/products/${notification.productId}`}>
          <Cover src={notification.imageUrl} size="16" px={64} />
          <Stack gap="1" minW="0" flex="1">
            <Text fontWeight="semibold" lineClamp={1}>
              {notification.artist} — {notification.title}
            </Text>
            <Text fontSize="sm" color="fg.muted" lineClamp={1}>
              {SUPPLIER_LABEL[notification.supplier]} · {notification.sourceTitle}
            </Text>
            <Text fontSize="sm">
              {formatPrice(fromPriceCents, currency)} →{' '}
              <chakra.span fontWeight="bold">{formatPrice(toPriceCents, currency)}</chakra.span> ·{' '}
              {formatPrice(fromPriceCents - toPriceCents, currency)} less
            </Text>
            <Text fontSize="xs" color="fg.subtle">
              {formatTimeAgo(notification.createdAt)}
            </Text>
          </Stack>
          {unread ? (
            <Box boxSize="2.5" mt="1.5" borderRadius="full" bg="brand.solid" flexShrink="0" />
          ) : null}
        </NextLink>
      </HStack>
    </chakra.li>
  );
}
