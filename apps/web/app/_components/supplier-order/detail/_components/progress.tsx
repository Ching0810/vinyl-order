import { Box, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import type { SupplierOrder } from '@vinyl-order/shared';

import Panel from '@/components/ui/panel';
import {
  SUPPLIER_ORDER_STATUS,
  flowSteps,
  hasReached,
  nextStepHint,
} from '@/lib/utils/supplier-order';

/**
 * Where an open or delivered order stands among its shop's steps
 * (flowSteps) — a Candlelight order has no "Shipped" — and, while it is
 * open, what to do next. Steps reached are filled, the latest in bold. Only
 * the status is stored, not when each step was reached, so the steps carry
 * no dates.
 *
 * @param order - the order, not cancelled
 */
export default function OrderProgress({ order }: { order: SupplierOrder }) {
  const steps = flowSteps(order.supplier);
  const latest = steps.findLast((step) => hasReached(order, step));
  const hint = nextStepHint(order);

  return (
    <Panel title="Progress">
      <SimpleGrid columns={steps.length}>
        {steps.map((step, index) => {
          const reached = hasReached(order, step);
          const following = steps[index + 1];
          return (
            <Stack key={step} align="center" gap="2" position="relative" minW="0">
              {/* The line to the next step, dark once the order is there. */}
              {following ? (
                <Box
                  position="absolute"
                  top="5px"
                  left="50%"
                  w="full"
                  h="2px"
                  bg={hasReached(order, following) ? 'gray.900' : 'gray.300'}
                />
              ) : null}
              <Box
                position="relative"
                boxSize="3"
                borderRadius="full"
                borderWidth="2px"
                borderColor={reached ? 'gray.900' : 'gray.300'}
                bg={reached ? 'gray.900' : 'bg.panel'}
              />
              <Text
                fontSize="xs"
                textAlign="center"
                px="1"
                color={reached ? 'gray.900' : 'gray.500'}
                fontWeight={step === latest ? 'semibold' : 'normal'}
              >
                {SUPPLIER_ORDER_STATUS[step].label}
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>
      {hint ? (
        <Box p="3" borderRadius="md" bg="gray.100">
          <Text fontSize="sm" color="gray.800">
            <chakra.span fontWeight="semibold">Next: </chakra.span>
            {hint}
          </Text>
        </Box>
      ) : null}
    </Panel>
  );
}
