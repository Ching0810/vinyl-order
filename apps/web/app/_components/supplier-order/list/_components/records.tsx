import { Accordion, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder, SupplierOrderItem } from '@vinyl-order/shared';

import ExpectedBadge from '@/components/supplier-order/expected-badge';
import { ChevronDownIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';
import { shownExpectedMonth } from '@/lib/utils/supplier-order';

/**
 * One record of an order: its title (one line, cut short with an ellipsis),
 * and its price × quantity with its own expected month — only while the
 * order is still to arrive and a shop gave one — so what each record cost
 * is seen beside the order's total.
 *
 * Compact on a phone's narrow tile: smaller type, and the month alone at
 * the line's far end. Otherwise "Expected …" follows the price.
 *
 * @param order - the order the record is in
 * @param item - the record
 * @param compact - set for the phone's tile
 */
export const SupplierOrderRecord = ({
  order,
  item,
  compact = false,
}: {
  order: SupplierOrder;
  item: SupplierOrderItem;
  compact?: boolean;
}) => (
  <Stack gap="1" minW="0">
    <Text fontSize={compact ? 'sm' : 'md'} color="gray.800" truncate>
      {item.title}
    </Text>
    <HStack justify={compact ? 'space-between' : 'start'} gap={compact ? '1.5' : '2'}>
      <Text fontSize={compact ? 'xs' : 'sm'} color="gray.600" truncate>
        {formatPrice(item.unitPriceCents, order.currency)} × {item.quantity}
      </Text>
      <ExpectedBadge month={shownExpectedMonth(order, item)} compact={compact} />
    </HStack>
  </Stack>
);

/**
 * The records after the first, folded under "N more records", which opens
 * them in place, so a card is the same size whatever the order holds until
 * asked. Nothing for a one-record order.
 *
 * @param order - the order
 * @param compact - set for the phone's tile
 */
export const MoreRecords = ({
  order,
  compact = false,
}: {
  order: SupplierOrder;
  compact?: boolean;
}) => {
  const rest = order.items.slice(1);
  if (rest.length === 0) return null;

  return (
    <Accordion.Root collapsible variant="plain">
      <Accordion.Item value="more">
        <Accordion.ItemTrigger
          py="0"
          gap="1"
          justifyContent="start"
          cursor="pointer"
          // Above the card's link, which covers the rest of the card.
          position="relative"
          zIndex="1"
          fontSize={compact ? 'xs' : 'sm'}
          color="gray.600"
        >
          {rest.length} more {rest.length === 1 ? 'record' : 'records'}
          <Accordion.ItemIndicator>
            <ChevronDownIcon />
          </Accordion.ItemIndicator>
        </Accordion.ItemTrigger>
        <Accordion.ItemContent>
          <Accordion.ItemBody p="0" pt="2">
            <Stack gap="2">
              {rest.map((item) => (
                <SupplierOrderRecord key={item.id} order={order} item={item} compact={compact} />
              ))}
            </Stack>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
};
