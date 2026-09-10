import { Box, Heading, Skeleton, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import type { ReactNode } from 'react';

import Carousel from '@/components/home/carousel';

// server component — the carousel and search islands are the only client parts.

/**
 * Homepage hero: the storefront's front cover, followed by the search bar.
 *
 * Shows the carousel when products are flagged into it, and falls back to a
 * static panel when none are — so a fresh catalogue, or one where nobody has
 * flagged anything yet, still gives the page a masthead instead of a gap.
 *
 * Search sits below the visual rather than inside it: its results dropdown would
 * otherwise open over rotating artwork, and the moving backdrop makes the list
 * harder to read.
 *
 * While `loading`, a placeholder holds the panel's exact height. Rendering the
 * static fallback instead would flash "no slides" for a moment and then swap to
 * the carousel, which reads as a glitch.
 *
 * @param slides - featured products in display order; empty renders the fallback
 * @param search - the client-side search island
 * @param loading - true while the slide query is still in flight
 */
const Hero = ({
  slides,
  search,
  loading = false,
}: {
  slides: Product[];
  search: ReactNode;
  loading?: boolean;
}) => (
  <Box px={{ base: '4', md: '8' }} pt={{ base: '4', md: '6' }}>
    <Box maxW="7xl" mx="auto">
      {loading ? (
        <Skeleton borderRadius="panel" h={{ base: '400px', md: '520px' }} />
      ) : slides.length > 0 ? (
        <Carousel slides={slides} />
      ) : (
        <Box
          position="relative"
          borderRadius="panel"
          bg="ink.950"
          color="ink.50"
          px={{ base: '6', md: '16' }}
          py={{ base: '14', md: '24' }}
        >
          {/* Warm off-centre glow so the flat panel reads as lit rather than blank. */}
          <Box
            position="absolute"
            inset="0"
            pointerEvents="none"
            borderRadius="panel"
            backgroundImage="radial-gradient(circle at 78% 18%, rgb(201 135 31 / 32%), transparent 55%)"
          />

          <Stack gap="6" maxW="2xl" position="relative">
            <Text textStyle="eyebrow" color="brand.300">
              New pressings, weekly
            </Text>

            <Heading
              as="h1"
              textStyle="display"
              fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
              color="ink.50"
            >
              Records worth
              <br />
              the shelf space.
            </Heading>

            <Text fontSize={{ base: 'md', md: 'lg' }} color="ink.300" maxW="lg">
              A hand-catalogued vinyl store. Search the shelves, or start with what&apos;s moving
              this week.
            </Text>
          </Stack>
        </Box>
      )}

      <Box mt={{ base: '5', md: '7' }} maxW={{ base: 'full', md: 'lg' }}>
        {search}
      </Box>
    </Box>
  </Box>
);

export default Hero;
