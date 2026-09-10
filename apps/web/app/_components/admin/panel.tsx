import { Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * A titled card grouping related form fields.
 *
 * The product form is long — release metadata, pricing, artwork and
 * merchandising all in one column. Splitting it into labelled panels gives the
 * eye somewhere to land and makes it obvious which fields belong together.
 *
 * @param title - the group's label
 * @param description - optional one-line explanation
 * @param children - the fields in this group
 */
const Panel = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <Stack
    gap="5"
    p={{ base: '5', md: '6' }}
    borderRadius="card"
    borderWidth="1px"
    borderColor="border.muted"
    bg="bg.panel"
  >
    <Stack gap="1">
      <Text textStyle="eyebrow" color="fg.muted">
        {title}
      </Text>
      {description ? (
        <Text fontSize="sm" color="fg.subtle">
          {description}
        </Text>
      ) : null}
    </Stack>
    {children}
  </Stack>
);

export default Panel;
