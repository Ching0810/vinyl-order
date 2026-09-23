import { Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * Shown in place of content that isn't there, for whatever reason — signed
 * out, nothing yet, not found: a headline, a line of explanation and one way
 * forward.
 *
 * @param title - what the visitor is looking at
 * @param body - why, in a sentence
 * @param cta - the next step, usually a link button
 */
const EmptyState = ({ title, body, cta }: { title: string; body: string; cta?: ReactNode }) => (
  <Stack gap="4" align="start" py="10">
    <Text fontSize="xl" fontWeight="semibold">
      {title}
    </Text>
    <Text color="fg.muted">{body}</Text>
    {cta}
  </Stack>
);

export default EmptyState;
