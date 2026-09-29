'use client';

import { HStack, IconButton, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@/components/ui/icons';
import type { PageTarget } from '@/hooks/useCursorPages';

/** A numbered button, or the gap between numbers that aren't adjacent. */
type Slot = { page: number; target: PageTarget | null } | { gap: string };

/**
 * The page numbers cursor paging can reach: the first, the ones either side
 * of the current page, and the last — with a gap wherever numbers are skipped.
 * Each number carries the move that reaches it; the current page has none.
 *
 * e.g. page 7 of 18 → 1 … 6 [7] 8 … 18
 */
const slots = (page: number, totalPages: number): Slot[] => {
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);

  const targetOf = (n: number): PageTarget | null => {
    if (n === page) return null;
    // Stepping by cursor before jumping: page 2's "1" and page 17's "18" are
    // also the adjacent pages, and either move lands in the same place.
    if (n === page - 1) return 'previous';
    if (n === page + 1) return 'next';
    return n === 1 ? 'first' : 'last';
  };

  return pages.flatMap((n, i): Slot[] => {
    const gap: Slot[] = i > 0 && n - pages[i - 1] > 1 ? [{ gap: `gap-${n}` }] : [];
    return [...gap, { page: n, target: targetOf(n) }];
  });
};

/**
 * Paging controls for a cursor-paginated list: first, previous, the reachable
 * page numbers, next, last.
 *
 * There is no "go to page N": a cursor can only step to its neighbours or
 * start again from either end. This only draws the controls and reports the
 * move; useCursorPages turns a move into the request.
 *
 * Enabled by the server's hasPreviousPage / hasNextPage rather than by the
 * page count, which is tracked on the client and could drift.
 *
 * @param page - the current page, 1-based
 * @param totalPages - how many pages the list fills
 * @param hasPrevious - whether a previous page exists
 * @param hasNext - whether a next page exists
 * @param busy - a fetch is in flight; everything locks to stop double-paging
 * @param onChange - called with the move the reader chose
 */
export default function Paginator({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  busy = false,
  onChange,
}: {
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  busy?: boolean;
  onChange: (target: PageTarget) => void;
}) {
  const reachable = (target: PageTarget): boolean =>
    !busy && (target === 'first' || target === 'previous' ? hasPrevious : hasNext);

  const arrow = (target: PageTarget, label: string, icon: ReactNode) => (
    <IconButton
      aria-label={label}
      size="sm"
      variant="ghost"
      borderRadius="full"
      disabled={!reachable(target)}
      onClick={() => onChange(target)}
    >
      {icon}
    </IconButton>
  );

  return (
    <chakra.nav aria-label="Pagination" mt="12">
      <HStack justify="center" gap="1.5" wrap="wrap">
        {arrow('first', 'First page', <ChevronFirstIcon />)}
        {arrow('previous', 'Previous page', <ChevronLeftIcon />)}

        {slots(page, totalPages).map((slot) =>
          'gap' in slot ? (
            <Text key={slot.gap} color="fg.muted" px="1" aria-hidden>
              …
            </Text>
          ) : (
            <IconButton
              key={slot.page}
              aria-label={`Page ${slot.page}`}
              aria-current={slot.target === null ? 'page' : undefined}
              size="sm"
              variant={slot.target === null ? 'solid' : 'subtle'}
              borderRadius="full"
              disabled={slot.target !== null && !reachable(slot.target)}
              onClick={() => {
                if (slot.target) onChange(slot.target);
              }}
            >
              {slot.page}
            </IconButton>
          ),
        )}

        {arrow('next', 'Next page', <ChevronRightIcon />)}
        {arrow('last', 'Last page', <ChevronLastIcon />)}
      </HStack>
    </chakra.nav>
  );
}
