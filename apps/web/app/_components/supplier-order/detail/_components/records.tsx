import { HStack, Stack, StackSeparator, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

import ExpectedBadge from '@/components/supplier-order/expected-badge';
import Cover from '@/components/ui/cover';
import Panel from '@/components/ui/panel';
import { formatPrice } from '@/lib/utils/currency';
import { shownExpectedMonth } from '@/lib/utils/supplier-order';

/**
 * Every record in the order, none folded away: its cover, its whole title,
 * price × quantity with its expected month while the order is open, and
 * what the line comes to.
 *
 * @param order - the order with its lines
 */
export default function OrderRecords({ order }: { order: SupplierOrder }) {
  const count = order.items.length;

  return (
    <Panel title={`${count} ${count === 1 ? 'record' : 'records'}`}>
      <Stack gap="4" separator={<StackSeparator borderColor="border.muted" />}>
        {order.items.map((item) => (
          <HStack key={item.id} gap="4" align="start">
            <Cover src={item.imageUrl} size={{ base: '16', md: '20' }} px={80} radius="8px" />
            <Stack gap="1.5" flex="1" minW="0">
              <Text color="gray.900">{item.title}</Text>
              <HStack gap="2" wrap="wrap">
                <Text fontSize="sm" color="gray.600">
                  {formatPrice(item.unitPriceCents, order.currency)} × {item.quantity}
                </Text>
                <ExpectedBadge month={shownExpectedMonth(order, item)} bg="gray.100" />
              </HStack>
            </Stack>
            <Text fontWeight="semibold" color="gray.900" flexShrink="0">
              {formatPrice(item.lineTotalCents, order.currency)}
            </Text>
          </HStack>
        ))}
      </Stack>
    </Panel>
  );
}
