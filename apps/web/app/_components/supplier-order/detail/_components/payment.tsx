'use client';

import { Button, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';
import type { ReactNode } from 'react';

import Panel from '@/components/ui/panel';
import { formatPrice } from '@/lib/utils/currency';
import { formatDay, todayInTaipei } from '@/lib/utils/date';
import { isUnpaid, orderAmounts } from '@/lib/utils/supplier-order';
import { useUpdateSupplierOrder } from '@/services/queries/supplier-orders/useUpdateSupplierOrder';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <HStack justify="space-between" gap="4" fontSize="sm">
    <Text color="fg.muted">{label}</Text>
    {children}
  </HStack>
);

/**
 * What the order cost and whether it is paid: the records' sum, what the
 * shop charged on top (shipping, less any discount) when its total was
 * entered and differs, the total, and the payment day — or "Unpaid", with
 * marking it paid today one tap away, as cash on pickup usually is.
 *
 * @param order - the order
 * @param onFailure - show why marking it paid didn't happen
 */
export default function OrderPayment({
  order,
  onFailure,
}: {
  order: SupplierOrder;
  onFailure: (message: string) => void;
}) {
  const updateMutation = useUpdateSupplierOrder();
  const { recordsCents, extraCents } = orderAmounts(order);
  const price = (cents: number) => formatPrice(cents, order.currency);

  const markPaid = () =>
    updateMutation.mutate(
      { id: order.id, input: { paidAt: todayInTaipei() } },
      { onError: () => onFailure("Couldn't mark the order paid. Please try again.") },
    );

  return (
    <Panel title="Payment">
      <Stack gap="2">
        <Row label="Records">
          <Text color="gray.900">{price(recordsCents)}</Text>
        </Row>
        {extraCents ? (
          <Row label="Shipping and other">
            <Text color={extraCents < 0 ? 'orange.600' : 'gray.900'}>{price(extraCents)}</Text>
          </Row>
        ) : null}
        {/* The extra is worked out, not stored, so a mistyped price or total
            shows up here. Less than the records is possible — a discount —
            but more often a typo, or a line edited without its total. */}
        {extraCents !== null && extraCents < 0 ? (
          <Text fontSize="xs" color="orange.600">
            The total is less than the records add up to. If no discount explains it, check the
            prices and the total in Edit order.
          </Text>
        ) : null}
        <Row label="Total">
          {/* Entered by hand and optional: a blank total is unknown, not zero. */}
          {order.totalCents !== null ? (
            <Text fontWeight="bold" color="gray.900">
              {price(order.totalCents)}
            </Text>
          ) : (
            <Text color="fg.muted">Not entered</Text>
          )}
        </Row>
      </Stack>
      <HStack
        justify="space-between"
        gap="4"
        pt="4"
        borderTopWidth="1px"
        borderColor="border.muted"
        fontSize="sm"
      >
        <Text color="fg.muted">Payment</Text>
        {order.paidAt ? (
          <Text color="gray.900">Paid {formatDay(order.paidAt)}</Text>
        ) : isUnpaid(order) ? (
          <HStack gap="3">
            <Text fontWeight="semibold" color="gray.900">
              Unpaid
            </Text>
            <Button
              size="xs"
              variant="outline"
              borderRadius="full"
              loading={updateMutation.isPending}
              onClick={markPaid}
            >
              Mark as paid today
            </Button>
          </HStack>
        ) : (
          <Text color="fg.muted">Not paid</Text>
        )}
      </HStack>
    </Panel>
  );
}
