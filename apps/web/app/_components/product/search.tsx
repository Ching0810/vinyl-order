'use client';

import { Box, Flex, Image, Input, Spinner, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { SearchIcon } from '@/components/ui/icons';
import { useDebouncedValue } from '@/lib/core/use-debounced-value';
import { formatPrice } from '@/lib/utils/currency';
import { searchProducts } from '@/services/api/products/search';

/**
 * Storefront search. The input keeps a fixed height; results render in an
 * absolutely-positioned dropdown overlay so the bar never grows. The query is
 * debounced 500ms after the final keystroke, then React Query fetches + caches.
 *
 * Styled to sit on the dark hero panel: a light pill on a dark ground, with the
 * results sheet reverting to the normal panel surface.
 */
const Search = () => {
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
    <Box position="relative" w="full" maxW={{ base: 'full', md: 'lg' }}>
      <Box position="relative">
        <Box
          position="absolute"
          insetStart="4"
          top="50%"
          transform="translateY(-50%)"
          color="fg.subtle"
          pointerEvents="none"
          zIndex="1"
        >
          <SearchIcon />
        </Box>
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setFocused(true)}
          // Delay so a click on a result isn't cut off by the blur closing the list.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search artist or title…"
          size={{ base: 'md', md: 'lg' }}
          ps="12"
          bg="bg.panel"
          color="fg"
          borderRadius="full"
          borderWidth="0"
          _placeholder={{ color: 'fg.subtle' }}
        />
      </Box>

      {open ? (
        <Box
          position="absolute"
          top="100%"
          insetX="0"
          mt="2"
          zIndex="dropdown"
          bg="bg.panel"
          color="fg"
          borderWidth="1px"
          borderColor="border.muted"
          borderRadius="card"
          boxShadow="lift"
          maxH={{ base: '64', md: '80' }}
          overflowY="auto"
          overflowX="hidden"
        >
          {isFetching ? (
            <Flex p="4" justify="center">
              <Spinner size="sm" />
            </Flex>
          ) : results && results.length > 0 ? (
            results.map((product) => (
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
            ))
          ) : (
            <Text p="4" fontSize="sm" color="fg.muted">
              No results.
            </Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
};

export default Search;
