import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

// server component — presentational shell; the search island is passed in.

/**
 * Homepage hero. A dark full-width panel that gives the storefront a front
 * cover: oversized display type, one line of copy, and the search island docked
 * underneath so the primary action sits inside the primary visual.
 *
 * Search is injected rather than imported so this stays a server component —
 * only the input itself needs to be client-side.
 *
 * @param search - the client-side search island rendered inside the panel
 */
const Hero = ({ search }: { search: ReactNode }) => (
  <Box px={{ base: '4', md: '8' }} pt={{ base: '4', md: '6' }}>
    <Box
      position="relative"
      overflow="hidden"
      maxW="7xl"
      mx="auto"
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
          A hand-catalogued vinyl store. Search the shelves, or start with what&apos;s moving this
          week.
        </Text>

        <Box pt="2">{search}</Box>
      </Stack>
    </Box>
  </Box>
);

export default Hero;
