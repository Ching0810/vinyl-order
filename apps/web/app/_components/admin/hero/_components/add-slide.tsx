'use client';

import { Box, Button, Flex, Input, Spinner, Stack, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';
import { useState } from 'react';

import { useDebouncedValue } from '@/lib/core/use-debounced-value';
import { searchProducts } from '@/services/api/products/search';
import { productsQueryKey } from '@/services/queries/products/use-products';

/** Cap the picker so a broad search can't produce an endless list. */
const MAX_RESULTS = 6;

/**
 * Search the catalogue for a record to add to the carousel.
 *
 * Products already in the carousel are filtered out — offering to add
 * something that's already there would silently move it instead, which isn't
 * what the button says.
 *
 * Membership is checked against the running order as well as the product's own
 * `slideOrder`. The search results live under a different query key, so they
 * lag a moment behind an add; without `inOrderIds` the record just added stays
 * listed as addable until that refetch lands.
 *
 * @param onAdd - called with the chosen product
 * @param busy - a write is in flight; the add buttons lock
 * @param inOrderIds - ids currently in the carousel, including optimistic adds
 */
const AddSlide = ({
  onAdd,
  busy,
  inOrderIds,
}: {
  onAdd: (product: Product) => void;
  busy: boolean;
  inOrderIds: Set<string>;
}) => {
  const [term, setTerm] = useState('');
  const q = useDebouncedValue(term.trim(), 400);

  const { data, isFetching } = useQuery({
    queryKey: [...productsQueryKey, 'search', q],
    queryFn: () => searchProducts(q),
    enabled: q.length > 0,
  });

  const candidates = (data ?? [])
    .filter((product) => product.slideOrder === null && !inOrderIds.has(product.id))
    .slice(0, MAX_RESULTS);

  return (
    <Stack gap="3">
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search the catalogue to add a record…"
        bg="bg.panel"
      />

      {q.length === 0 ? null : isFetching ? (
        <Flex p="3" justify="center">
          <Spinner size="sm" />
        </Flex>
      ) : candidates.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          No matches outside the carousel.
        </Text>
      ) : (
        <Stack gap="2">
          {candidates.map((product) => (
            <Flex
              key={product.id}
              gap="3"
              align="center"
              p="2"
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              bg="bg.panel"
            >
              <Box
                position="relative"
                boxSize="9"
                flexShrink="0"
                borderRadius="sm"
                overflow="hidden"
                bg="bg.muted"
              >
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt=""
                    fill
                    sizes="36px"
                    style={{ objectFit: 'cover' }}
                  />
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
              <Button size="xs" colorPalette="brand" disabled={busy} onClick={() => onAdd(product)}>
                Add
              </Button>
            </Flex>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default AddSlide;
