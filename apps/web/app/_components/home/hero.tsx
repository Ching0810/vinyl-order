import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * Homepage hero: the storefront's front cover, followed by the search bar.
 *
 * Search sits below the panel rather than inside it, so its results dropdown
 * opens over the page rather than over the artwork.
 *
 * @param search - the client-side search island
 */
export default function Hero({ search }: { search: ReactNode }) {
  return (
    <Box px={{ base: '4', md: '8' }} pt={{ base: '4', md: '6' }}>
      <Box maxW="7xl" mx="auto">
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
              A hand-catalogued vinyl store. Search the shelves, or start with the latest arrivals.
            </Text>
          </Stack>
        </Box>

        <Box mt={{ base: '5', md: '7' }} maxW={{ base: 'full', md: 'lg' }}>
          {search}
        </Box>
      </Box>
    </Box>
  );
}
