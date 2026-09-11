'use client';

import { Button, HStack, Text } from '@chakra-ui/react';

/**
 * Previous / page number / Next controls for a cursor-paginated list.
 *
 * Cursor paging has no page index — you can only step to the adjacent page —
 * so `pageNum` is display-only, there to tell the reader roughly where they
 * are. That is also why there are no numbered page links.
 *
 * @param pageNum - 1-based position, for display only
 * @param hasPrevious - whether a previous page exists
 * @param hasNext - whether a next page exists
 * @param busy - a fetch is in flight; both buttons lock to stop double-paging
 */
const Paginator = ({
  pageNum,
  hasPrevious,
  hasNext,
  busy = false,
  onPrevious,
  onNext,
}: {
  pageNum: number;
  hasPrevious: boolean;
  hasNext: boolean;
  busy?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) => (
  <HStack justify="center" gap="4" mt="12">
    <Button
      size="sm"
      variant="outline"
      borderRadius="full"
      onClick={onPrevious}
      disabled={!hasPrevious || busy}
    >
      Previous
    </Button>
    <Text fontSize="sm" color="fg.muted">
      Page {pageNum}
    </Text>
    <Button
      size="sm"
      variant="outline"
      borderRadius="full"
      onClick={onNext}
      disabled={!hasNext || busy}
    >
      Next
    </Button>
  </HStack>
);

export default Paginator;
