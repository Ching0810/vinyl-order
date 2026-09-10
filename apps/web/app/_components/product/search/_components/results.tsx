import { Box, Flex, Image, Spinner, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';

import { formatPrice } from '@/lib/utils/currency';

/**
 * The result rows for a search query, shared by the desktop dropdown and the
 * mobile drawer so both surfaces render matches identically.
 *
 * @param results - matches for the current query, or undefined before first fetch
 * @param isFetching - whether a request is in flight
 */
const Results = ({ results, isFetching }: { results?: Product[]; isFetching: boolean }) => {
  if (isFetching) {
    return (
      <Flex p="6" justify="center">
        <Spinner size="sm" />
      </Flex>
    );
  }

  if (!results || results.length === 0) {
    return (
      <Text p="4" fontSize="sm" color="fg.muted">
        No results.
      </Text>
    );
  }

  return (
    <Box>
      {results.map((product) => (
        <Flex
          key={product.id}
          gap="3"
          p="2.5"
          align="center"
          transition="background 0.15s"
          _hover={{ bg: 'bg.subtle' }}
        >
          <Box boxSize="11" flexShrink="0" bg="bg.muted" borderRadius="md" overflow="hidden">
            {product.imageUrl ? (
              <Image src={product.imageUrl} alt="" boxSize="11" objectFit="cover" />
            ) : null}
          </Box>
          <Box flex="1" minW="0">
            <Text fontSize="sm" fontWeight="semibold" truncate>
              {product.artist}
            </Text>
            <Text fontSize="xs" color="fg.muted" truncate>
              {product.title}
            </Text>
          </Box>
          <Text fontSize="sm" fontWeight="medium" flexShrink="0">
            {formatPrice(product.priceCents, product.currency)}
          </Text>
        </Flex>
      ))}
    </Box>
  );
};

export default Results;
