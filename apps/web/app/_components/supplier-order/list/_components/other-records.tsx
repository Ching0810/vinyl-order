import { Text, type TextProps } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

/**
 * "+N" for the records after an order's first, which a card shows by its
 * first alone so every card keeps one size; nothing for a one-record order.
 *
 * @param order - the order
 * @param props - where to place it
 */
export default function OtherRecords({ order, ...props }: { order: SupplierOrder } & TextProps) {
  const others = order.items.length - 1;
  if (others < 1) return null;

  return (
    <Text
      fontSize="xs"
      fontWeight="semibold"
      color="white"
      bg="gray.900"
      borderRadius="full"
      px="2"
      py="0.5"
      {...props}
    >
      +{others}
    </Text>
  );
}
