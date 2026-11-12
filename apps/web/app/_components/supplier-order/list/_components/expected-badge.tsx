import { Badge, type BadgeProps } from '@chakra-ui/react';

import { formatMonth } from '@/lib/utils/date';

/**
 * "Expected 2026年11月", as a white pill; nothing when no month is known.
 * Callers place it where it takes no line of its own — on the cover, or
 * beside the price — so a card without it is laid out the same.
 *
 * @param month - `YYYY-MM`, or null when not known
 * @param props - where to place it
 */
export default function ExpectedBadge({ month, ...props }: { month: string | null } & BadgeProps) {
  if (!month) return null;

  return (
    <Badge bg="white" color="gray.700" borderRadius="full" px="2" fontWeight="medium" {...props}>
      Expected {formatMonth(month)}
    </Badge>
  );
}
