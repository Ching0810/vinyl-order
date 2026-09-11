import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * Editorial heading for a section or a screen: a small amber eyebrow, an
 * oversized title, an optional description, and an optional trailing action.
 * The rule underneath is what separates one block from the next, so sections
 * don't need their own borders.
 *
 * Shared by the storefront and the admin area so both halves of the app read
 * as one product rather than a shop with a tool bolted on.
 *
 * @param eyebrow - short all-caps kicker above the title
 * @param title - the section or screen title
 * @param description - optional one-line explanation beneath the title
 * @param action - optional node pinned to the trailing edge (e.g. a link)
 */
const SectionHeading = ({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <Stack gap="5" mb="8">
    <Flex align={{ base: 'start', sm: 'end' }} justify="space-between" gap="4" wrap="wrap">
      <Stack gap="2">
        <Text textStyle="eyebrow">{eyebrow}</Text>
        <Heading textStyle="display" fontSize={{ base: '2xl', md: '3xl' }}>
          {title}
        </Heading>
        {description ? (
          <Text fontSize="sm" color="fg.muted">
            {description}
          </Text>
        ) : null}
      </Stack>
      {action}
    </Flex>
    <Box borderTopWidth="1px" borderColor="border" />
  </Stack>
);

export default SectionHeading;
