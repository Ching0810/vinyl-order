import { Badge, type BadgeProps } from '@chakra-ui/react';

import { formatMonth } from '@/lib/utils/date';

/**
 * When a record is expected, as a white pill beside its price; nothing when
 * no month is known. "Expected 2026年11月" where there is room, the month
 * alone where there isn't (a phone's narrow tile), since beside a price it
 * can only mean one thing.
 *
 * @param month - `YYYY-MM`, or null when not known
 * @param compact - the month alone, without "Expected"
 * @param props - where to place it
 */
export default function ExpectedBadge({
  month,
  compact = false,
  ...props
}: { month: string | null; compact?: boolean } & BadgeProps) {
  if (!month) return null;

  return (
    <Badge
      bg="white"
      color="gray.700"
      borderRadius="full"
      px="2"
      fontWeight="medium"
      flexShrink="0"
      {...props}
    >
      {compact ? formatMonth(month) : `Expected ${formatMonth(month)}`}
    </Badge>
  );
}
