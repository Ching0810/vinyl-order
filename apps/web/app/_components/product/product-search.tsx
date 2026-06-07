'use client';

import { Box, Flex, Image, Input, Spinner, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useDebouncedValue } from '@/lib/core/use-debounced-value';
import { searchProducts } from '@/services/api/products/search';

const formatPrice = (priceCents: number, currency: string) =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency }).format(priceCents / 100);

/**
 * Storefront search. The input keeps a fixed height; results render in an
 * absolutely-positioned dropdown overlay so the bar never grows. The query is
 * debounced 500ms after the final keystroke, then React Query fetches + caches.
 */
const ProductSearch = () => {
  const [term, setTerm] = useState('');
  const [focused, setFocused] = useState(false);
  const q = useDebouncedValue(term.trim(), 500);

  const { data: results, isFetching } = useQuery({
    queryKey: ['products', 'search', q],
    queryFn: () => searchProducts(q),
    enabled: q.length > 0,
  });

  const open = focused && term.trim().length > 0;

  return (
    <Box position="relative" maxW="xl" mx="auto" w="full">
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => setFocused(true)}
        // Delay so a click on a result isn't cut off by the blur closing the list.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search artist or title…"
      />

      {open ? (
        <Box
          position="absolute"
          top="100%"
          insetX="0"
          mt="1"
          zIndex="dropdown"
          bg="bg"
          borderWidth="1px"
          borderRadius="md"
          boxShadow="md"
          maxH="80"
          overflowY="auto"
        >
          {isFetching ? (
            <Flex p="3" justify="center">
              <Spinner size="sm" />
            </Flex>
          ) : results && results.length > 0 ? (
            results.map((product) => (
              <Flex key={product.id} gap="3" p="2" align="center" _hover={{ bg: 'bg.muted' }}>
                <Box boxSize="10" flexShrink="0" bg="bg.muted" borderRadius="sm" overflow="hidden">
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt="" boxSize="10" objectFit="cover" />
                  ) : null}
                </Box>
                <Box flex="1" minW="0">
                  <Text fontSize="sm" fontWeight="medium" truncate>
                    {product.artist}
                  </Text>
                  <Text fontSize="xs" color="fg.muted" truncate>
                    {product.title}
                  </Text>
                </Box>
                <Text fontSize="sm" flexShrink="0">
                  {formatPrice(product.priceCents, product.currency)}
                </Text>
              </Flex>
            ))
          ) : (
            <Text p="3" fontSize="sm" color="fg.muted">
              No results.
            </Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
};

export default ProductSearch;
