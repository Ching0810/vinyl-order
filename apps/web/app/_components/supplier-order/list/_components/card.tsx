import { Badge, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder, SupplierOrderItem } from '@vinyl-order/shared';
import type { ReactNode } from 'react';

import SupplierOrderStatusBadge from '@/components/supplier-order/status-badge';
import Cover from '@/components/ui/cover';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay, formatMonth } from '@/lib/utils/date';
import { SUPPLIER_LABEL, isUnpaid, nextStepHint } from '@/lib/utils/supplier-order';

import SupplierOrderActions from './actions';

/**
 * One record in the order, as the card's title: its cover, title, price ×
 * quantity, and when it's due if known. Every line keeps the cover's place —
 * a blank tile when there is none (typed lines, and lines from a shop whose
 * email shows none) — so titles line up whether or not a line has one.
 *
 * `aside` sits at the right end of the row; the title gives way to it,
 * cut short with an ellipsis rather than pushing it off the card.
 */
const Line = ({
  item,
  currency,
  aside,
}: {
  item: SupplierOrderItem;
  currency: string;
  aside: ReactNode;
}) => (
  <HStack gap="3" align="start">
    <Cover src={item.imageUrl} size="12" px={48} />
    <Stack gap="0.5" flex="1" minW="0">
      <Text fontWeight="semibold" truncate>
        {item.title}
      </Text>
      <Text fontSize="sm" color="fg.muted">
        {formatPrice(item.unitPriceCents, currency)} × {item.quantity}
        {item.expectedMonth ? ` · expected ${formatMonth(item.expectedMonth)}` : ''}
      </Text>
    </Stack>
    {aside}
  </HStack>
);

/** Where the order stands, whether it's paid, and its actions menu. */
const OrderBadges = ({
  order,
  onFailure,
}: {
  order: SupplierOrder;
  onFailure: (message: string) => void;
}) => (
  <HStack gap="1.5" flexShrink="0">
    {isUnpaid(order) ? (
      <Badge colorPalette="orange" variant="outline" borderRadius="full" px="2.5">
        Unpaid
      </Badge>
    ) : null}
    <SupplierOrderStatusBadge status={order.status} />
    <SupplierOrderActions order={order} onFailure={onFailure} />
  </HStack>
);

/**
 * What to do next (tracker.md §9.5). Waiting at the store is the one that
 * needs doing now, so it stands out; the others are a quiet reminder of
 * what to watch for.
 */
const NextStep = ({ order }: { order: SupplierOrder }) => {
  const hint = nextStepHint(order);
  if (!hint) return null;
  if (order.status === 'ready_for_pickup') {
    return (
      <Text
        fontSize="sm"
        fontWeight="medium"
        colorPalette="purple"
        color="colorPalette.fg"
        bg="colorPalette.subtle"
        px="3"
        py="2"
        borderRadius="md"
      >
        {hint}
      </Text>
    );
  }
  return (
    <Text fontSize="sm" color="fg.muted">
      {hint}
    </Text>
  );
};

/**
 * One supplier order, fully open: there are only a handful, and what's in
 * each and when it's due is the point of the page, so nothing hides behind a
 * click.
 *
 * The records are the title, with the status, "Unpaid" and the menu at the
 * right end of the first one's row; where and when they were ordered — shop,
 * order number, day, tracking — is one quiet line under them, with the
 * total. The order number is
 * plain text for now; linking it needs each shop's order page URL, which is
 * behind their login and not yet known. Its actions — status, paid, edit,
 * delete — sit behind the "more" button.
 *
 * @param order - the order with its lines
 * @param onFailure - show why one of its actions didn't happen
 */
export default function SupplierOrderCard({
  order,
  onFailure,
}: {
  order: SupplierOrder;
  onFailure: (message: string) => void;
}) {
  const details = [
    SUPPLIER_LABEL[order.supplier],
    `Order ${order.orderNumber}`,
    formatDay(order.orderedAt),
    ...(order.trackingNumber ? [`Tracking ${order.trackingNumber}`] : []),
  ];

  return (
    <Stack
      gap="4"
      p="4"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="card"
      bg="bg.panel"
    >
      <Stack gap="3">
        {order.items.map((item, index) => (
          <Line
            key={item.id}
            item={item}
            currency={order.currency}
            // The order's badges and menu ride on its first record's row.
            aside={index === 0 ? <OrderBadges order={order} onFailure={onFailure} /> : null}
          />
        ))}
      </Stack>

      <Stack gap="1" fontSize="sm" color="fg.muted">
        <Flex justify="space-between" align="baseline" gap="4">
          <Text minW="0">{details.join(' · ')}</Text>
          {/* Entered by hand and optional: a blank total is unknown, not zero. */}
          {order.totalCents !== null ? (
            <Text fontSize="md" fontWeight="bold" color="fg" flexShrink="0">
              {formatPrice(order.totalCents, order.currency)}
            </Text>
          ) : null}
        </Flex>
        {order.note ? <Text whiteSpace="pre-wrap">{order.note}</Text> : null}
      </Stack>

      <NextStep order={order} />
    </Stack>
  );
}
