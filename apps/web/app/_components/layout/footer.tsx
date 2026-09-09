import { Flex, HStack, Stack, Text } from '@chakra-ui/react';

import { DiscIcon } from '@/components/ui/icons';

// server component — static chrome, no state or handlers.

/**
 * Storefront footer: a wordmark, a one-line positioning statement, and the
 * copyright. Stacks to a single column below `md` so the wordmark and copyright
 * aren't squeezed onto one line on a phone.
 */
const Footer = () => (
  <Flex
    as="footer"
    direction="column"
    mt="24"
    borderTopWidth="1px"
    borderColor="border"
    bg="bg.subtle"
  >
    <Flex
      w="full"
      maxW="7xl"
      mx="auto"
      px={{ base: '4', md: '8' }}
      py={{ base: '10', md: '12' }}
      gap="6"
      direction={{ base: 'column', md: 'row' }}
      justify="space-between"
      align={{ base: 'start', md: 'center' }}
    >
      <Stack gap="3">
        <HStack gap="2.5">
          <DiscIcon width="1.4em" height="1.4em" />
          <Text
            textStyle="display"
            fontSize="md"
            letterSpacing="tightest"
            textTransform="uppercase"
          >
            Vinyl Order
          </Text>
        </HStack>
        <Text fontSize="sm" color="fg.muted" maxW="sm">
          Pressed records, catalogued by hand.
        </Text>
      </Stack>

      <Text fontSize="xs" color="fg.subtle">
        © {new Date().getFullYear()} Vinyl Order
      </Text>
    </Flex>
  </Flex>
);

export default Footer;
