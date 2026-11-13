'use client';

import { Button, Clipboard, HStack, Stack, Text } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

import Panel from '@/components/ui/panel';

/**
 * The tracking number and the note, each only when there is one, and
 * nothing at all when neither is. The number can be copied, to paste into
 * the carrier's or convenience store's tracking page.
 *
 * @param order - the order
 */
export default function OrderInfo({ order }: { order: SupplierOrder }) {
  const { trackingNumber, note } = order;
  if (!trackingNumber && !note) return null;

  return (
    <Panel title="Details">
      <Stack gap="4" fontSize="sm">
        {trackingNumber ? (
          <Stack gap="1">
            <Text color="fg.muted">Tracking number</Text>
            <HStack justify="space-between" gap="3">
              <Text color="gray.900" fontFamily="mono" wordBreak="break-all">
                {trackingNumber}
              </Text>
              <Clipboard.Root value={trackingNumber} flexShrink="0">
                <Clipboard.Trigger asChild>
                  <Button size="xs" variant="outline" borderRadius="full">
                    <Clipboard.Indicator copied="Copied">Copy</Clipboard.Indicator>
                  </Button>
                </Clipboard.Trigger>
              </Clipboard.Root>
            </HStack>
          </Stack>
        ) : null}
        {note ? (
          <Stack gap="1">
            <Text color="fg.muted">Note</Text>
            <Text color="gray.900" whiteSpace="pre-wrap">
              {note}
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </Panel>
  );
}
