import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * Editorial section header: a small amber eyebrow, an oversized title, and an
 * optional trailing action. The rule under the row is what visually separates
 * one homepage section from the next, so sections don't need their own borders.
 *
 * @param eyebrow - short all-caps kicker above the title
 * @param title - the section title
 * @param action - optional node pinned to the trailing edge (e.g. a link)
 */
const SectionHeading = ({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) => (
  <Stack gap="5" mb="8">
    <Flex align={{ base: 'start', sm: 'end' }} justify="space-between" gap="4" wrap="wrap">
      <Stack gap="2">
        <Text textStyle="eyebrow">{eyebrow}</Text>
        <Heading textStyle="display" fontSize={{ base: '2xl', md: '3xl' }}>
          {title}
        </Heading>
      </Stack>
      {action}
    </Flex>
    <Box borderTopWidth="1px" borderColor="border" />
  </Stack>
);

export default SectionHeading;
