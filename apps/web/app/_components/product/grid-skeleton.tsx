'use client';

import { SimpleGrid, Skeleton, Stack } from '@chakra-ui/react';

/**
 * Placeholder tiles shown while the catalogue loads.
 *
 * Mirrors the real grid's column counts, gutters and square cover ratio so the
 * layout doesn't shift when data arrives — the point of a skeleton is to hold
 * the space, not just to signal activity.
 *
 * @param count - how many placeholder tiles to draw
 */
const GridSkeleton = ({ count = 8 }: { count?: number }) => (
  <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={{ base: '3', sm: '4', md: '6' }}>
    {Array.from({ length: count }, (_, i) => (
      <Stack
        key={i}
        gap="0"
        borderRadius="card"
        overflow="hidden"
        bg="bg.panel"
        borderWidth="1px"
        borderColor="border.muted"
      >
        <Skeleton aspectRatio="1" />
        <Stack gap="2" p="4">
          <Skeleton h="4" w="70%" />
          <Skeleton h="3" w="90%" />
          <Skeleton h="5" w="40%" mt="1" />
        </Stack>
      </Stack>
    ))}
  </SimpleGrid>
);

export default GridSkeleton;
