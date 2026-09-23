import { Accordion, Flex, Stack, Text } from '@chakra-ui/react';
import type { OrderSummary } from '@vinyl-order/shared';

import StatusBadge from '@/components/order/status-badge';
import { ChevronDownIcon } from '@/components/ui/icons';
import { formatPrice } from '@/lib/utils/currency';
import { formatDateTime } from '@/lib/utils/date';
import { orderReference } from '@/lib/utils/order';

import Items from './items';
/**
 * One order in the history, as an accordion item.
 *
 * Collapsed, it is about the order as a whole — reference, date, how many
 * records, total and status — so no single record stands in for the rest, and
 * nothing is shown twice once it opens. Expanded, it lists every record with
 * its cover, quantity and price (loaded on first open; see Items).
 *
 * Must be rendered inside an Accordion.Root (see OrderHistory).
 *
 * @param order - the order summary
 */
export default function Row({ order }: { order: OrderSummary }) {
  return (
    <Accordion.Item
      value={order.id}
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="card"
      bg="bg.panel"
      overflow="hidden"
    >
      <Accordion.ItemTrigger
        p="4"
        cursor="pointer"
        alignItems="start"
        _hover={{ bg: 'bg.muted' }}
        transition="background 0.15s"
      >
        <Flex flex="1" justify="space-between" align="start" gap="4" textAlign="start">
          <Stack gap="1" minW="0">
            <Text fontWeight="semibold">Order {orderReference(order.id)}</Text>
            <Text fontSize="sm" color="fg.muted">
              {formatDateTime(order.createdAt)} · {order.lineCount}{' '}
              {order.lineCount === 1 ? 'record' : 'records'}
            </Text>
          </Stack>

          <Stack gap="1.5" align="end" flexShrink="0">
            <Text fontWeight="bold">{formatPrice(order.subtotalCents, order.currency)}</Text>
            <StatusBadge status={order.status} />
          </Stack>
        </Flex>

        <Accordion.ItemIndicator color="fg.muted" mt="0.5">
          <ChevronDownIcon />
        </Accordion.ItemIndicator>
      </Accordion.ItemTrigger>

      <Accordion.ItemContent>
        <Accordion.ItemBody px="4" pb="4" pt="4" borderTopWidth="1px" borderColor="border.muted">
          <Items id={order.id} />
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  );
}
